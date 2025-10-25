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
    let lastQuality = -1;
    let qualityHistory = [];
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
        
        // Initialize lastQuality if first run
        if (lastQuality === -1) {
            lastQuality = currentQuality;
        }
        
        // Update throughput history
        if (tput > 0) {
            throughputHistory.push(tput);
            if (throughputHistory.length > HISTORY_SIZE) {
                throughputHistory.shift();
            }
        }
        
        // Calculate smoothed throughput (weighted average with recent values having more weight)
        let smoothedThroughput = tput;
        if (throughputHistory.length > 3) {
            let weights = [];
            let totalWeight = 0;
            for (let i = 0; i < throughputHistory.length; i++) {
                weights[i] = (i + 1) / throughputHistory.length;
                totalWeight += weights[i];
            }
            smoothedThroughput = 0;
            for (let i = 0; i < throughputHistory.length; i++) {
                smoothedThroughput += (throughputHistory[i] * weights[i]) / totalWeight;
            }
        }
        
        // Define buffer thresholds
        const BUFFER_CRITICAL = 2.0;  // Switch down immediately
        const BUFFER_LOW = 4.0;       // Conservative switching
        const BUFFER_SAFE = 6.0;      // Normal operation
        const BUFFER_HIGH = 8.0;      // Can be more aggressive
        
        // Define switching constraints
        const MIN_SWITCH_INTERVAL = 10000; // 10 seconds in milliseconds
        const THROUGHPUT_MARGIN = 0.85;    // Use 85% of measured throughput
        const STARTUP_MARGIN = 0.75;      // More conservative during startup
        
        // Calculate time since last switch
        const currentTime = Date.now();
        const timeSinceLastSwitch = currentTime - lastSwitchTime;
        const timeSinceStart = (currentTime - startTime) / 1000; // in seconds
        
        // Determine if we're in startup phase (first 30 seconds)
        const isStartup = timeSinceStart < 30;
        const margin = isStartup ? STARTUP_MARGIN : THROUGHPUT_MARGIN;
        
        // Default to current quality
        let quality = currentQuality;
        let switchReason = "maintain current quality";
        
        // Safety check for invalid values
        if (!bufferLevel || bufferLevel < 0 || !smoothedThroughput || smoothedThroughput < 0) {
            console.log("Invalid metrics, maintaining current quality");
            quality = currentQuality;
        } else {
            // Critical buffer - switch down aggressively
            if (bufferLevel < BUFFER_CRITICAL) {
                // Find lowest quality that we can sustain
                for (let i = 0; i < bitrateList.length; i++) {
                    if (bitrateList[i].bandwidth / 1000 <= smoothedThroughput * 0.6) {
                        quality = i;
                    }
                }
                switchReason = "critical buffer level";
            }
            // Low buffer - conservative approach
            else if (bufferLevel < BUFFER_LOW) {
                // Only switch down if current bitrate exceeds available throughput
                if (currentQuality > 0 && bitrateList[currentQuality].bandwidth / 1000 > smoothedThroughput * margin) {
                    quality = currentQuality - 1;
                    switchReason = "low buffer, insufficient throughput";
                } else {
                    quality = currentQuality;
                }
            }
            // Safe buffer - normal operation
            else if (bufferLevel < BUFFER_SAFE) {
                // Can maintain or carefully increase
                let targetBandwidth = smoothedThroughput * margin;
                
                // Find best quality within bandwidth budget
                quality = 0;
                for (let i = 0; i < bitrateList.length; i++) {
                    if (bitrateList[i].bandwidth / 1000 <= targetBandwidth) {
                        quality = i;
                    }
                }
                
                // Apply hysteresis to prevent oscillation
                if (quality > currentQuality && quality - currentQuality > 1) {
                    quality = currentQuality + 1; // Step up gradually
                    switchReason = "safe buffer, stepping up";
                } else if (quality < currentQuality && currentQuality - quality > 1) {
                    quality = currentQuality - 1; // Step down gradually
                    switchReason = "safe buffer, stepping down";
                } else {
                    switchReason = "safe buffer, optimal quality";
                }
            }
            // High buffer - can be more aggressive
            else {
                let targetBandwidth = smoothedThroughput * margin;
                
                // Find highest sustainable quality
                quality = 0;
                for (let i = 0; i < bitrateList.length; i++) {
                    if (bitrateList[i].bandwidth / 1000 <= targetBandwidth * 1.1) { // Slightly more aggressive
                        quality = i;
                    }
                }
                
                // Can step up more aggressively with high buffer
                if (quality > currentQuality) {
                    switchReason = "high buffer, increasing quality";
                } else if (quality < currentQuality) {
                    // Still apply hysteresis when switching down
                    quality = Math.max(quality, currentQuality - 1);
                    switchReason = "high buffer, controlled decrease";
                }
            }
        }
        
        // Apply switch rate limiting (except for critical situations)
        if (bufferLevel >= BUFFER_CRITICAL && timeSinceLastSwitch < MIN_SWITCH_INTERVAL && quality !== currentQuality) {
            console.log(`Switch rate limit: only ${timeSinceLastSwitch}ms since last switch`);
            quality = currentQuality;
            switchReason = "rate limited";
        }
        
        // Ensure quality is within valid range
        quality = Math.max(0, Math.min(quality, bitrateList.length - 1));
        
        // Log decision
        console.log(`Buffer: ${bufferLevel?.toFixed(2)}s, Throughput: ${smoothedThroughput?.toFixed(0)} kbps, ` +
                   `Current: ${currentQuality}, Target: ${quality}, Reason: ${switchReason}`);
        
        // Update state if switching
        if (quality !== currentQuality) {
            lastSwitchTime = currentTime;
            switchCount++;
            const switchRate = switchCount / timeSinceStart;
            console.log(`Switch #${switchCount}, Rate: ${switchRate.toFixed(3)} switches/sec`);
        }
        
        // Update quality history
        qualityHistory.push(quality);
        if (qualityHistory.length > HISTORY_SIZE) {
            qualityHistory.shift();
        }
        lastQuality = quality;

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