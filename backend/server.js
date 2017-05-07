'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const config = require('config');
const apiMarvel = require('marvel-api');

var app = express();
app.set('port', (process.env.PORT || 4000));
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(express.static('public'));

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
                if (event.message) {
                    sendGenericMessage(event);
                }
            });
        });
    }

    res.sendStatus(200);
});

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

    callSendAPI(messageData);
}

/**
 * Send a Structured Message (Generic Message type) using the Send API.
 */
function sendGenericMessage(event) {
    var recipientId = event.sender.id;

    var id = null,
        thumbnail = '',
        name = '',
        description = '',
        urlDetail = '';

    var urls = [];

    marvel.characters.findByName(event.message.text)
        .then(function(res) {
            if (typeof res.data[0] !== "undefined") {
                id = res.data[0].id;
                name = res.data[0].name;
                thumbnail = res.data[0].thumbnail;
                description = res.data[0].description;
                urls = res.data[0].urls;
            } else {
                sendTextMessage(recipientId, 'Não conseguimos encontrar o seu personagem :(');
            }
        })
        .then(function(res) {

            urlDetail = urls.map(function(item) {
                if (item.type == 'detail') {
                    return item.url;
                }
            });

            urlDetail = urlDetail[0].split('?');

            var messageData = {
                recipient: {
                    id: recipientId
                },
                message: {
                    attachment: {
                        type: "template",
                        payload: {
                            template_type: "generic",
                            elements: [{
                                title: name,
                                subtitle: description,
                                image_url: thumbnail.path + "/portrait_medium." + thumbnail.extension,
                                buttons: [{
                                    type: "web_url",
                                    url: urlDetail[0],
                                    title: "Ver mais"
                                }]
                            }]
                        }
                    }
                }
            };

            callSendAPI(messageData);
        })
        .fail(console.error)
        .done(function(data) {
        });
}

function callSendAPI(messageData) {
    request({
        uri: 'https://graph.facebook.com/v2.6/me/messages',
        qs: { access_token: MESSENGER_VALIDATE_TOKEN },
        method: 'POST',
        json: messageData

    }, function (error, res, body) {
        if (!error && res.statusCode == 200) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;

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