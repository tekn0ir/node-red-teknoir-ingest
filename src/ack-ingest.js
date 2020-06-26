module.exports = function(RED) {
    "use strict";

    function AckIngest(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        this.on('input', function(msg) {
            if(msg.ingestAck){
                msg.ingestAck()
            }
            node.send(msg);
        });
    }
    RED.nodes.registerType("ack-ingest", AckIngest);
}