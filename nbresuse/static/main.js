define(['jquery', 'base/js/utils', 'require'], function ($, utils, require) {

    function setupDOM() {
        // FIXME: Do something cleaner to get styles in here?
        $('#maintoolbar-container').append(
            $('<div>').attr('id', 'nbresuse-display')
                        .addClass('btn-group')
                        .addClass('pull-right')
        )
    
        $('head').append(
            $('<style>').html('.nbresuse-warn { background-color: #FFD2D2; color: #D8000C; }')
        );
        $('head').append(
            $('<style>').html('#nbresuse-display { padding: 2px 8px; }'),
        );
        $('head').append(
            $('<style>').html('#nbresuse-display > span { padding-right: 5px; }')
        );
        
    }

    var PodEvictionDisplay = function() {
        var showedModal = false;
        var evictionTime;
        var countdownEndSequence = false;
        var evictionInterval;

        var appendDisplay = function() {
            // there's no need for this unless eviction is occurring
            return;
        }

        var appendCountdownElements = function() {
            // add the modal
            var modal = '<div id="terminateModal" class="modal" role="dialog" style="display: none;">' +
                            '<div class="modal-dialog">' +
                                '<div class="modal-content">' +
                                    '<div class="modal-header">' +
                                        '<button type="button" class="close" data-dismiss="modal">&times;</button>' +
                                        '<h4 class="modal-title">Out of Capacity Notification - Pod Eviction</h4>' +
                                    '</div>' +
                                    '<div class="modal-body">' +
                                        '<p class="alert alert-warning"><strong>Warning!</strong> Your pod will evict itself in <span class="evictTime"></span> seconds! Please save and shutdown everything or else risk losing data. <br><br>' +
                                        'Please see the <a href="https://ucsdservicedesk.service-now.com/its?id=kb_article_view&sysparm_article=KB0030470">FAQ</a> for more details.</p>' +
                                    '</div>' +
                                    '<div class="modal-footer">' +
                                        '<button type="button" class="btn btn-default" data-dismiss="modal">Close</button>' +
                                    '</div>' +
                                '</div>' +
                            '</div>' +
                        '</div>';
            $('body').append(modal);

            // add a countdown timer
            var countdown = '<strong> Seconds Until Pod Eviction: </strong><span id="skullface" title="Seconds Til Eviction" class="evictTime"></span>'
            $('#nbresuse-display').append(countdown);
            
            // add blinker style
            var blinker = '<style>#blink { animation: blinker 1s linear infinite; } @keyframes blinker { 50% { opacity: 0; }}</style>'
            $('head').append(blinker);
        }
        
        var countDown = function() {
            if (evictionTime > 30) {
                $('.evictTime').text(evictionTime);

                if (!showedModal) {
                    $('#terminateModal').modal('toggle');
                    showedModal = true;
                }

            } else if (countdownEndSequence) {
                // do nothing
                return
            } 
            else {
                $('#terminateModal').modal('hide');
                var skull = '<span id="blink">&#9760;</span>'
                $('#skullface')
                    .replaceWith(skull)
                
                clearInterval(evictionInterval);
                countdownEndSequence = true;
            }
        }

        var setEvictionTime = function(terminationTime) {
            evictionTime = terminationTime;

            evictionInterval = setInterval(function() {
                evictionTime--;
                countDown();
            }, 1000);
        }

        var update = function(data) {
            var terminationTime = data['termination'];

            if (terminationTime > 0 && !showedModal) {
                setEvictionTime(terminationTime);
                appendCountdownElements();
                countDown();
            }
        }

        return {
            update: update,
            appendDisplay: appendDisplay
        }
    }

    var GPUDisplay = function() {
        var showedDisplay = false;

        var appendDisplay = function() {
            // do nothing, some users may not have a gpu, in which case they
            // don't need to have an empty display
            return;
        }
        var showDisplay = function() {
            $('#nbresuse-display').append(
                $('<strong>').text(' GPU: ')
            ).append(
                $('<span>').attr('id', 'nbresuse-gpu')
                           .attr('title', 'Actively used gpu (updates every 5s)')
            );

            showedDisplay = true;
        }

        var update = function(data) {
            var gpuData = data['gpu'];

            if (gpuData !== 'n/a') {
                if (!showedDisplay) {
                    showDisplay();
                }
                $('#nbresuse-gpu').text(gpuData);
            }
        }

        return {
            update: update,
            appendDisplay: appendDisplay
        }
    }

    var MemoryDisplay = function() {
        var appendDisplay = function() {
            $('#nbresuse-display').append(
                $('<strong>').text('Memory: ')
            ).append(
                $('<span>').attr('id', 'nbresuse-mem')
                            .attr('title', 'Actively used Memory (updates every 5s)')
            );
        }

        var update = function(data) {
            // FIXME: Proper setups for MB and GB. MB should have 0 things
            // after the ., but GB should have 2.    
            var display = Math.round(data['rss'] / (1024 * 1024));

            var limits = data['limits'];
            if ('memory' in limits) {
                if ('rss' in limits['memory']) {
                    display += " / " + (limits['memory']['rss'] / (1024 * 1024));
                }
                if (limits['memory']['warn']) {
                    $('#nbresuse-display').addClass('nbresuse-warn');
                } else {
                    $('#nbresuse-display').removeClass('nbresuse-warn');
                }
            }
            if (data['limits']['memory'] !== null) {
            }
            $('#nbresuse-mem').text(display + ' MB');
        }

        return {
            update: update,
            appendDisplay: appendDisplay
        }
    }

    var CpuDisplay = function() {
        var appendDisplay = function() {
            $('#nbresuse-display').append(
                $('<strong>').text('CPU: ')
            ).append(
                $('<span>').attr('id', 'nbresuse-percent-cpu')
                            .attr('title', 'Actively used Memory (updates every 5s)')
            );
        }

        var update = function(data) {
            $('#nbresuse-percent-cpu').text(data['cpu_percent_usage'] + '%');
        }

        return {
            appendDisplay: appendDisplay,
            update: update
        }
    }

    var MetricsHandler = function() {
        var listeners = [];
        var is404 = false;
        var url = utils.get_body_data('baseUrl') + 'metrics';
        var pollInterval;
        var updateTime;

        // used for detecting redirects
        var xhr = new XMLHttpRequest
        
        var setup = function() {
            appendButton();
        }

        var appendButton = function() {
            $('#maintoolbar-container').append(
                $('<div class="btn-group"><button class="btn btn-default" id="collect_metrics">Show Usage</button></div>')
            );
        }

        var setUpdateTime = function(updateTimeSec) {
            updateTime = updateTimeSec * 1000;
        }

        /**
         * listener must have an update and appendDisplay method
         */
        var registerListener = function(listener) {
            listeners.push(listener)
        }

        var stopPoll = function() {
            $('#nbresuse-display').empty()
            // destroy the pollInterval
            clearInterval(pollInterval)
        }

        var startPoll = function() {
            listeners.forEach(listener => listener.appendDisplay());
            
            // get the polling started
            poll();
            pollInterval = setInterval(poll, updateTime);
        }

        var poll = function() {
            if (document.hidden) {
                // return if no one is watching
                console.log('polling stopped');
                return;
            }
            if (is404) {
                // stop polling if there's a 404 from metrics
                return;
            }

            $.ajax({
                type: 'get',
                dataType: 'json',
                url: url,
                xhr: function() {
                    return xhr
                }
            }).done(function(data) {
                try {
                    // stop if redirected
                    if (!xhr.responseURL.endsWith(url)) {
                        throw new Error('redirect');
                    } 
                    // send updated data to listeners
                    for (var i = 0; i < listeners.length; i++) {
                        listeners[i].update(data)
                    }
                } catch (error) {
                    // something wrong with page, 
                    is404 = true;
                    stopPoll();
                }
            }).fail(function() {
                // something wrong with link
                is404 = true;
                stopPoll();
            });
        }

        setup();

        return {
            registerListener: registerListener,
            setUpdateTime: setUpdateTime,
            startPoll: startPoll,
            stopPoll: stopPoll
        }
    }

    var load_ipython_extension = function () {
        setupDOM();
        var collectMetrics = false;
        var memoryDisplay = MemoryDisplay();
        var cpuDisplay = CpuDisplay();
        var gpuDisplay = GPUDisplay();
        var podEvictorDisplay = PodEvictionDisplay();

        var metricsHandler = MetricsHandler();
        metricsHandler.setUpdateTime(5);
        metricsHandler.registerListener(memoryDisplay);
        metricsHandler.registerListener(cpuDisplay);
        metricsHandler.registerListener(gpuDisplay);
        metricsHandler.registerListener(podEvictorDisplay);

        $('#collect_metrics').click(function() {
            collectMetrics = !collectMetrics;
            collectMetrics ? metricsHandler.startPoll() : metricsHandler.stopPoll();
        });
    
    };

    return {
        load_ipython_extension: load_ipython_extension,
    };
});
