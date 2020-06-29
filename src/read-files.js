
module.exports = function(RED) {
    "use strict";
    const NODE_TYPE = "cloud-storage-read";
    const {Storage} = require("@google-cloud/storage");

    function CSReadNode(config) {
        RED.nodes.createNode(this, config);  // Required by the Node-RED spec.

        let storage;
        const node = this;
        const isList = config.list;
        let fileName_option;
        if (!config.filename) {
            fileName_option = "";
        } else {
            fileName_option = config.filename.trim();
        }

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


        async function readFile(msg, filename) {
            const bucketName = namespace + "." + domain;
            const bucket = storage.bucket(bucketName);
            const file   = bucket.file(filename);

            // Get the metadata for the object/file and store it at msg.metadata.
            try {
                const [metadata] = await file.getMetadata();
                msg.metadata = metadata;
            }
            catch(err) {
                node.error(`getMetadata error: ${err.message}`);
                return;
            }

            msg.payload = null; // Set the initial output to be nothing.

            const readStream = file.createReadStream();

            readStream.on("error", (err) => {
                node.error(`readStream error: ${err.message}`);
            });

            readStream.on("end", () => {
                // TBD: Currently we are returning a Buffer.  We may wish to consider examining
                // the metadata and see if it of text/* and, if it is, convert the payload
                // to a string.
                node.send(msg);   // Send the message onwards to the next node.
            });

            readStream.on("data", (data) => {
                if (data == null) {
                    return;
                }
                if (msg.payload == null) {
                    msg.payload = data;
                } else {
                    msg.payload = Buffer.concat([msg.payload, data]);
                }
            });

        } // readFile

        async function listFiles(msg, filename) {
            const bucketName = namespace + "." + domain;
            const bucket = storage.bucket(bucketName);
            const getFilesOptions = {
                prefix: filename
            };
            const [files] = await bucket.getFiles(getFilesOptions);
            const retArray = [];
            files.forEach((file) => {
                retArray.push(file.metadata);
            });
            msg.payload = retArray;
            node.send(msg);
        }
        
        /**
         * Receive an input message for processing.
         * @param {*} msg 
         */
        function Input(msg) {
            let filename;

            if (!msg.filename && fileName_option === "" && !msg.payload) {   // Validate that we have been passed the mandatory filename parameter.
                node.error('No filename found in msg.filename or configuration.');
                return;
            }

            if (typeof msg.filename != "string" && fileName_option === "" && !msg.payload) { // Validate that the mandatory filename is a string.
                node.error("The msg.filename was not a string");
                return;
            }

            if (!Array.isArray(msg.payload) && fileName_option === "" && !msg.filename) { // Validate that the mandatory filename is a string.
                node.error("The msg.payload was not a Cloud Storage object array");
                return;
            }

            // We have two possibilities for supplying a filename.  These are msg.filename at runtime
            // and the filename configuration property.  If both are present, then msg.filename will
            // be used.
            if (msg.filename) {
                filename = msg.filename.trim();
            } else {
                filename = fileName_option;
            }

            if (isList) {
                listFiles(msg, filename);
            } else {
                if (Array.isArray(msg.payload)) {
                    msg.payload.forEach((file) => {

                        readFile(msg, file.name);
                    });
                } else {
                    readFile(msg, filename);
                }
            }
        } // Input


        /**
         * Cleanup this node.
         */
        function Close() {
        } // Close

        storage = new Storage();

        node.on("input", Input);
        node.on("close", Close);
    } // CSReadNode

    RED.nodes.registerType(NODE_TYPE, CSReadNode); // Register the node.
};
