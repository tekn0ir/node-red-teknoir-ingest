module.exports = function(RED) {
    "use strict";

    const STATUS_CONNECTED = {
        fill: "green",
        shape: "dot",
        text: "connected"
    };

    const STATUS_CONNECTED_WITH_ERRORS = {
        fill: "orange",
        shape: "dot",
        text: "connected_with_errors"
    };

    const STATUS_DISCONNECTED = {
        fill: "red",
        shape: "dot",
        text: "disconnected"
    };

    const STATUS_CONNECTING = {
        fill: "yellow",
        shape: "dot",
        text: "connecting"
    };

    const {RETRY_CODES} = require('@google-cloud/pubsub/build/src/pull-retry');
    RETRY_CODES.push(1);
    const {PubSub} = require("@google-cloud/pubsub");

    function Ingest(config) {
        let pubsub = null;
        let subscription = null;

        RED.nodes.createNode(this, config);

        const node = this;

        let options = {};

        if (!process.env.NAMESPACE) {
            node.error('A NAMESPACE environment variable is required');
            return;
        }
        var namespace = process.env.NAMESPACE;

        options.subscription = namespace + config.subscriptionSuffix;
        options.assumeJSON = config.assumeJSON;

        node.status(STATUS_DISCONNECTED);

        // Called when a new message is received from PubSub.
        function OnMessage(message) {
            if (message === null) {
                return;
            }

            const msg = {
                "payload": message.data,    // Save the payload data at msg.payload
                "attributes": message.attributes  // Save the attributes data at msg.attributes
            };

            // If the configuration property asked for JSON, then convert to an object.
            if (config.assumeJSON === true) {
                msg.payload = JSON.parse(RED.util.ensureString(message.data));
            }

            try {
                node.send(msg);
                if (config.backpressure === true) {
                    msg.ingestAck = function () {
                        // console.log("message.ack()");
                        message.ack();
                    };
                } else {
                    message.ack();
                }
           } catch (e) {
                if (e.details) {
                    node.error(e.details);
                } else {
                    console.log(e);
                }
                // OnClose();
                node.status(STATUS_CONNECTED_WITH_ERRORS);
            }
        } // OnMessage

        // Called when a new error is received from PubSub.
        function OnError(error) {
            node.error(`PubSub error: ${error}`);
            // OnClose();
            node.status(STATUS_CONNECTED_WITH_ERRORS);
        } // OnError

        function OnClose() {
            node.status(STATUS_DISCONNECTED);
            if (subscription) {
                subscription.close();  // No longer receive messages.
                subscription.removeListener('message', OnMessage);
                subscription.removeListener('error', OnError);
                subscription = null;
            }
            pubsub = null;
        } // OnClose

        pubsub = new PubSub();

        const subscriberOptions = {
            flowControl: {
                maxMessages: 10, // Max In Progress, not yet acked
            },
        };

        node.status(STATUS_CONNECTING);                              // Flag the node as connecting.
        pubsub.subscription(options.subscription, subscriberOptions).get().then((data) => {
            subscription = data[0];
            subscription.on('message', OnMessage);
            subscription.on('error', OnError);
            node.status(STATUS_CONNECTED);
        }).catch((reason) => {
            node.error(reason);
            node.status(STATUS_DISCONNECTED);
        });


        node.on("close", OnClose);
    } // Ingest

    RED.nodes.registerType("ingest-metrics", Ingest);
    RED.nodes.registerType("ingest-state", Ingest);
};
