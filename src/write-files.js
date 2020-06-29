module.exports = function(RED) {
    "use strict";
    const NODE_TYPE = 'cloud-storage-write';
    const {Storage} = require('@google-cloud/storage');

    function CSWriteNode(config) {
         RED.nodes.createNode(this, config);  // Required by the Node-RED spec.

        let storage;
        const node = this;
        const fileName_options = config.filename.trim();
        const contentType_options = config.contentType.trim();

        if (!process.env.NAMESPACE) {
            node.error('A NAMESPACE environment variable is required');
            return;
        }
        var namespace = process.env.NAMESPACE;

        if (!process.env.DOMAIN) {
            node.error('A DOMAIN environment variable is required');
            return;
        }
        var domain = process.env.DOMAIN;

        function Input(msg) {
            if (!msg.filename && fileName_options === "") { // If no msg.filename AND no options for filename, then that would be an error.
                node.error(`No filename found in msg.filename and no file name configured (${fileName_options})`);
                return;
            }
            if (!msg.payload) {
                node.error('No data found in msg.payload');
                return;
            }

            let fileName;
            if (msg.filename) {
                fileName = RED.util.ensureString(msg.filename).trim();
            }
            else {
                fileName = fileName_options;
            }

            const bucketName = namespace + "." + domain;
            const bucket = storage.bucket(bucketName); // Get access to the bucket
            const file   = bucket.file(fileName);      // Model access to the file in the bucket

            const writeStreamOptions = {}; // https://googleapis.dev/nodejs/storage/latest/global.html#CreateWriteStreamOptions

            // If we have a msg.contentType field, use it.  If we don't but we have a contentType set in options, use
            // that.  Otherwise don't supply a content type.
            if (msg.contentType) {
                writeStreamOptions.contentType = RED.util.ensureString(msg.contentType);
            } else if (contentType_options !== "") {
                writeStreamOptions.contentType = contentType_options;
            }

            const writeStream = file.createWriteStream(writeStreamOptions); // Create a write stream to the file.

            writeStream.on('error', (err) => {
                node.error(`writeStream error: ${err.message}`);
            });
            writeStream.on('finish', () => { // When we receive the indication that the write has finished, signal the end.
                node.send(msg);
            });
            writeStream.end(msg.payload); // Write the data to the object.

        } // Input


        /**
         * Cleanup this node.
         */
        function Close() {
        }

        storage = new Storage();

        node.on('input', Input);
        node.on('close', Close);
    } // CSWriteNode

    RED.nodes.registerType(NODE_TYPE, CSWriteNode); // Register the node.
};