module.exports = function(RED) {
    "use strict";

    const STATUS_CONNECTED = {
        fill: "green",
        shape: "dot",
        text: "connected"
    };

    const STATUS_CONNECTED_WITH_ERRORS = {
        fill: "green",
        shape: "ring",
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

    const { RETRY_CODES } = require('@google-cloud/pubsub/build/src/pull-retry');
    const { Status } = require('google-gax');


    RETRY_CODES.push(
        Status.DEADLINE_EXCEEDED,
        Status.RESOURCE_EXHAUSTED,
        Status.ABORTED,
        Status.INTERNAL,
        Status.UNAVAILABLE,
        Status.CANCELLED,
    );


    const { PubSub } = require("@google-cloud/pubsub");

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
            node.status(STATUS_CONNECTED);
            if (message === null) {
                return;
            }

            const msg = {
                "payload": message.data, // Save the payload data at msg.payload
                "attributes": message.attributes // Save the attributes data at msg.attributes
            };

            // If the configuration property asked for JSON, then convert to an object.
            if (config.assumeJSON === true) {
                msg.payload = JSON.parse(RED.util.ensureString(message.data));
            }

            try {
                node.send(msg);
                if (config.backpressure === true) {
                    msg.ingestAck = function() {
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
                subscription.close(); // No longer receive messages.
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

        const retrySettings = {
            retryCodes: RETRY_CODES,
            backoffSettings: {
                maxRetries: 10000,
                // The initial delay time, in milliseconds, between the completion
                // of the first failed request and the initiation of the first retrying request.
                initialRetryDelayMillis: 1000,
                // The multiplier by which to increase the delay time between the completion
                // of failed requests, and the initiation of the subsequent retrying request.
                retryDelayMultiplier: 10,
                // The maximum delay time, in milliseconds, between requests.
                // When this value is reached, retryDelayMultiplier will no longer be used to increase delay time.
                maxRetryDelayMillis: 60000 * 5,
                // The initial timeout parameter to the request.
                initialRpcTimeoutMillis: 5000,
                // The multiplier by which to increase the timeout parameter between failed requests.
                rpcTimeoutMultiplier: 2.0,
                // The maximum timeout parameter, in milliseconds, for a request. When this value is reached,
                // rpcTimeoutMultiplier will no longer be used to increase the timeout.
                maxRpcTimeoutMillis: 600000,
                // The total time, in milliseconds, starting from when the initial request is sent,
                // after which an error will be returned, regardless of the retrying attempts made meanwhile.
                totalTimeoutMillis: 600000,
            },
        };

        node.status(STATUS_CONNECTING); // Flag the node as connecting.
        pubsub.subscription(options.subscription, subscriberOptions).get({
            gaxOpts: {
                maxRetries: 10000, // seems this  controls reconnections as well
                retry: retrySettings
                    // new RetryOptions(RETRY_CODES, {
                    //     initialRetryDelayMillis: 100 * 1000,
                    //     retryDelayMultiplier: 2,
                    //     maxRetryDelayMillis: 100 * 1000
                    // })
            }
        }).then((data) => {
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