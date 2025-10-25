/**
 * The copyright in this software is being made available under the BSD License,
 * included below. This software may be subject to other third party and contributor
 * rights, including patent rights, and no such rights are granted under this license.
 *
 * Copyright (c) 2013, Dash Industry Forum.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *  * Redistributions of source code must retain the above copyright notice, this
 *  list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright notice,
 *  this list of conditions and the following disclaimer in the documentation and/or
 *  other materials provided with the distribution.
 *  * Neither the name of Dash Industry Forum nor the names of its
 *  contributors may be used to endorse or promote products derived from this software
 *  without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS AS IS AND ANY
 *  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 *  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 *  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 *  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 *  NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 *  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */

var BitrateRule;

function BitrateRuleClass() {
    let context = this.context;
    let factory = dashjs.FactoryMaker;
    let SwitchRequest = factory.getClassFactoryByName("SwitchRequest");
    let MetricsModel = factory.getSingletonFactoryByName("MetricsModel");
    let instance;
    
    let lastSwitchTime = 0;
    let switchCount = 0;
    let startTime = Date.now();
    let throughputHistory = [];
    const HISTORY_SIZE = 10;

    // Gets called when the rule is created
    function setup() {
        console.log("Custom BitrateRule Created");
    }

    // This function gets called periodically by the player to decide which quality to choose for next segment request
    // Do not rename this function but you can create other functions and call them from within this one
    function getSwitchRequest(rulesContext) {
        let metricsModel = MetricsModel(context).getInstance();
        var mediaType = rulesContext.getMediaInfo().type;
        var metrics = metricsModel.getMetricsFor(mediaType, true);
        // Get current throughput and buffer level
        let tput = player.getAverageThroughput(mediaType);
        let bufferLevel = player.getDashMetrics().getCurrentBufferLevel("video");

        // Get bitrate information
        let abrController = rulesContext.getAbrController();
        let bitrateList = rulesContext.getMediaInfo()["bitrateList"];
        const currentRep = rulesContext.getRepresentation();
        const currentQuality = bitrateList.findIndex(r => r.id === currentRep.id);
        
        
        // Track throughput history
        if (tput > 0) {
            throughputHistory.push(tput);
            if (throughputHistory.length > HISTORY_SIZE) {
                throughputHistory.shift();
            }
        }
        
        // Calculate average throughput
        let avgThroughput = throughputHistory.length > 0 
            ? throughputHistory.reduce((a, b) => a + b) / throughputHistory.length 
            : tput;
        
        const CRITICAL_BUFFER = 6.0;  // Below this: conservative
        const MIN_SWITCH_INTERVAL = 10000;
        
        const currentTime = Date.now();
        const timeSinceLastSwitch = currentTime - lastSwitchTime;
        const timeSinceStart = (currentTime - startTime) / 1000;
        
        let quality = currentQuality;
        let switchReason = "maintain";
        let margin;
        
        if (bufferLevel < CRITICAL_BUFFER) {
            // CONSERVATIVE MODE: Buffer is low, be careful
            margin = 0.7;
            switchReason = "low buffer - conservative";
        } else {
            // AGGRESSIVE MODE: Buffer is healthy, maximize quality
            margin = 0.85;
            switchReason = "healthy buffer - aggressive";
        }
        
        quality = 0;
        for (let i = 0; i < bitrateList.length; i++) {
            if (bitrateList[i].bandwidth / 1000 <= avgThroughput * margin) {
                quality = i;
            }
        }
        
        // Emergency: if buffer < 3s and quality hasn't decreased, force down
        if (bufferLevel < 3.0 && quality >= currentQuality && currentQuality > 0) {
            quality = Math.max(0, currentQuality - 1);
            switchReason = "emergency - forcing down";
        }
        
        // Rate limiting: prevent too frequent switches
        if (timeSinceLastSwitch < MIN_SWITCH_INTERVAL && quality !== currentQuality) {
            // Exception: allow immediate switch if buffer is very low
            if (bufferLevel >= 3.0) {
                quality = currentQuality;
                switchReason = "rate limited";
            }
        }
        
        // Clamp quality
        quality = Math.max(0, Math.min(quality, bitrateList.length - 1));
        
        // Log decision
        console.log(`Buffer: ${bufferLevel.toFixed(2)}s, ` +
                   `Throughput: ${avgThroughput.toFixed(0)} kbps, ` +
                   `Current: ${currentQuality}, Target: ${quality}, ` +
                   `Reason: ${switchReason}`);
        
        // Update state if switching
        if (quality !== currentQuality) {
            lastSwitchTime = currentTime;
            switchCount++;
            const switchRate = switchCount / timeSinceStart;
            console.log(`Switch #${switchCount}, Rate: ${switchRate.toFixed(3)} switches/sec`);
        }
        

        // Create switch request
        const targetKbit = bitrateList[quality].bandwidth / 1000;
        const newRepresentation = abrController.getOptimalRepresentationForBitrate(rulesContext.getMediaInfo(), targetKbit, true);

        switchRequest = SwitchRequest(context).create();
        switchRequest.representation = newRepresentation;
        switchRequest.reason = switchReason;
        switchRequest.priority = SwitchRequest.PRIORITY.STRONG;

        return switchRequest;
    }

    instance = {
        getSwitchRequest
    };

    setup();

    return instance;
}

BitrateRuleClass.__dashjs_factory_name = "BitrateRule";
// Check if dashjs is loaded before using it
if (typeof dashjs !== 'undefined') {
    BitrateRule = dashjs.FactoryMaker.getClassFactory(BitrateRuleClass);
} else {
    // For cases where dashjs might load later
    BitrateRule = BitrateRuleClass;
}