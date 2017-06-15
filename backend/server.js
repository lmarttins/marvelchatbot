'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const config = require('config');
const apiMarvel = require('marvel-api');
const bluebird = require('bluebird');
const redis = require('redis');

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

var app = express();
app.set('port', (process.env.PORT || 4000));
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(express.static('public'));

var cache = redis.createClient({port: 6379, host: 'redis', family: 4});

/**
 * Get config or env token
 */
const MESSENGER_VALIDATE_TOKEN = (process.env.MESSENGER_VALIDATE_TOKEN) ?
    process.env.MESSENGER_VALIDATE_TOKEN :
    config.get('validateToken');

var marvel = apiMarvel.createClient({
    publicKey: config.get("marvelPublicKey"),
    privateKey: config.get("marvelPrivateKey")
});

var getStarted = null;

app.get('/', function (req, res) {
    res.send('Hello World!');
});

app.get('/webhook/', function (req, res) {
    if (req.query['hub.verify_token'] === MESSENGER_VALIDATE_TOKEN) {
        res.send(req.query['hub.challenge']);
    }
    res.send('Error, wrong token');
});

app.post('/webhook/', function (req, res) {
    var data = req.body;

    if (data.object == 'page') {
        data.entry.forEach(function(pageEntry) {
            pageEntry.messaging.forEach(function(event) {
                if (event.postback) {
                    if (event.postback.payload == 'GET_STARTED_PAYLOAD') {
                      request({
                          uri: 'https://graph.facebook.com/v2.6/' + event.sender.id,
                          qs: {
                            fields: 'first_name',
                            access_token: MESSENGER_VALIDATE_TOKEN
                          },
                          method: 'GET'
                      }, function (error, res, body) {
                          if (!error && res.statusCode == 200) {
                              var json = JSON.parse(body);
                              var text = json.first_name + ', Digite o nome de um personagem Marvel em inglês :D';
                              sendTextMessage(event.sender.id, text);
                          }
                      });
                    }
                }

                if (event.message) {
                    sendGenericMessage(event);
                }
            });
        });
    }

    res.sendStatus(200);
});

/**
 * Send simple message text
 *
 * @param recipientId
 * @param messageText
 */
function sendTextMessage(recipientId, messageText) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: messageText,
            metadata: "DEVELOPER_DEFINED_METADATA"
        }
    };

    callSendAPI(messageData, 'messages');
}

/**
 * Send a Structured Message (Generic Message type) using the Send API.
 *
 * @param event
 */
function sendGenericMessage(event) {
    var recipientId = event.sender.id;
    var data = {};
    var messageData = {};

    cache.getAsync(event.message.text)
        .then(function(res) {
            if (res !== null) {
                var dataAsync = JSON.parse(res);
                messageData = {
                    recipient: {
                        id: recipientId
                    },
                    message: {
                        attachment: {
                            type: "template",
                            payload: {
                                template_type: "generic",
                                elements: [{
                                    title: dataAsync.name,
                                    subtitle: dataAsync.description,
                                    image_url: dataAsync.thumbnail.path + "/portrait_medium." + dataAsync.thumbnail.extension,
                                    buttons: [{
                                        type: "web_url",
                                        url: dataAsync.urlDetail[0],
                                        title: "Ver mais"
                                    }]
                                }]
                            }
                        }
                    }
                };

                callSendAPI(messageData, 'messages');
            } else {
                marvel.characters.findByName(event.message.text)
                    .then(function (res) {
                        if (typeof res.data[0] !== "undefined") {
                            data = {
                                id: res.data[0].id,
                                name: res.data[0].name,
                                thumbnail: res.data[0].thumbnail,
                                description: res.data[0].description,
                                urls: res.data[0].urls
                            };
                        } else {
                            sendTextMessage(recipientId, 'Não conseguimos encontrar o seu personagem :(');
                        }
                    })
                    .then(function (res) {

                        data.urlDetail = data.urls.map(function (item) {
                            if (item.type == 'detail') {
                                return item.url;
                            }
                        });

                        data.urlDetail = data.urlDetail[0].split('?');

                        cache.set(event.message.text, JSON.stringify(data), function (err, reply) {
                            console.log(err);
                        });

                        messageData = {
                            recipient: {
                                id: recipientId
                            },
                            message: {
                                attachment: {
                                    type: "template",
                                    payload: {
                                        template_type: "generic",
                                        elements: [{
                                            title: data.name,
                                            subtitle: data.description,
                                            image_url: data.thumbnail.path + "/portrait_medium." + data.thumbnail.extension,
                                            buttons: [{
                                                type: "web_url",
                                                url: data.urlDetail[0],
                                                title: "Ver mais"
                                            }]
                                        }]
                                    }
                                }
                            }
                        };

                        callSendAPI(messageData, 'messages');
                    })
                    .fail(console.error)
                    .done(function (data) {
                    });
            }
        });
}

/**
 * Get first name user recipient
 *
 * @param userId
 */
function getFirstName(userId) {
    request.get({
        url: 'https://graph.facebook.com/v2.6/' + userId + '?fields=first_name&' + MESSENGER_VALIDATE_TOKEN
    }, function (err, res) {
        console.log(res.body);
    });
}

/**
 * Call send request API Facebook Messenger
 *
 * @param messageData
 * @param resourceType
 */
function callSendAPI(messageData, resourceType) {
    request({
        uri: 'https://graph.facebook.com/v2.6/me/' + resourceType,
        qs: { access_token: MESSENGER_VALIDATE_TOKEN },
        method: 'POST',
        json: messageData

    }, function (error, res, body) {
        if (!error && res.statusCode == 200) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;

            if (body.result) {
                getStarted = body.result;
                console.log(getStarted);
            }

            if (messageId) {
                console.log("Successfully sent message with id %s to recipient %s",
                    messageId, recipientId);
            } else {
                console.log("Successfully called Send API for recipient %s",
                    recipientId);
            }
        } else {
            console.error("Failed calling Send API", res.statusCode, res.statusMessage, body.error);
        }
    });
}

app.listen(app.get('port'), function () {
    console.log('App listening port: ', app.get('port'));
});
