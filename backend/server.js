'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const config = require('config');

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

const SERVER_URL = process.env.SERVER_URL;

console.log(SERVER_URL);

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
                    sendGenericMessage(event.sender.id);
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
 * Send a button message using the Send API.
 */
function sendButtonMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "This is test text",
                    buttons:[{
                        type: "web_url",
                        url: "https://www.oculus.com/en-us/rift/",
                        title: "Open Web URL"
                    }, {
                        type: "postback",
                        title: "Trigger Postback",
                        payload: "DEVELOPER_DEFINED_PAYLOAD"
                    }, {
                        type: "phone_number",
                        title: "Call Phone Number",
                        payload: "+16505551234"
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a Structured Message (Generic Message type) using the Send API.
 *
 */
function sendGenericMessage(recipientId) {
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
                        title: "rift",
                        subtitle: "Next-generation virtual reality",
                        item_url: "https://www.oculus.com/en-us/rift/",
                        image_url: "https://www.google.com.br/imgres?imgurl=http%3A%2F%2Fwww.oculosshop.com.br%2Fmedia%2Fcatalog%2Fproduct%2Fcache%2F1%2Fimage%2F9df78eab33525d08d6e5fb8d27136e95%2Fm%2Fo%2Fmormaii-monterey-oculos-de-sol.jpg&imgrefurl=http%3A%2F%2Fwww.oculosshop.com.br%2FOCULOS-DE-SOL&docid=u_5tuX9A6M5AyM&tbnid=RDh17EiRMIdIwM%3A&vet=10ahUKEwiw86yG89zTAhUKkJAKHa2sAzIQMwhgKAAwAA..i&w=1140&h=787&bih=629&biw=1295&q=oculos&ved=0ahUKEwiw86yG89zTAhUKkJAKHa2sAzIQMwhgKAAwAA&iact=mrc&uact=8",
                        buttons: [{
                            type: "web_url",
                            url: "https://www.oculus.com/en-us/rift/",
                            title: "Open Web URL"
                        }, {
                            type: "postback",
                            title: "Call Postback",
                            payload: "Payload for first bubble"
                        }]
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

function callSendAPI(messageData) {
    request({
        uri: 'https://graph.facebook.com/v2.6/me/messages',
        qs: { access_token: MESSENGER_VALIDATE_TOKEN },
        method: 'POST',
        json: messageData

    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
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
            console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
        }
    });
}

app.listen(app.get('port'), function () {
    console.log('App listening port: ', app.get('port'));
});