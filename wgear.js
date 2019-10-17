
function WGear ( statusCallback, cfg ) {
    if (!(this instanceof WGear)) {
        return new WGear( statusCallback, cfg );
    }

    if(typeof statusCallback != 'function') {
        cfg = statusCallback;
        statusCallback = null;
    }

    cfg = cfg || null;
    statusCallback = statusCallback || null;

    var exec_func_list = [];

    var promise = {},
        callback = {},
        gear_console = {};

    var ws = null;
    var port_list = [
        { wss : 20173, ws : 20174 , https : 20171, http : 20172 }
    ];
    var port_idx = 0;
    var config = {
        version : {
            js : '1.7.69.191016',
            app : null
        },
        project : {
            name : null,
            opmode : null
        },
        secure : true, // wss or ws
        ip : "127.0.0.1",
        port : port_list[port_idx],
        uid : null,
        modules : [],
        autoConnect : true,
        minVersion : 2.0,
        direct : false,
        spreadEventParams : false,
        baseOnly : false,
        platform : 'AnyCPU', // AnyCPU, x86, x64
        status : 'ready' // connecting, reconnecting, initializing, open, closing, closed, error
    };

    if(cfg){
        if(typeof cfg.secure != 'undefined') {
            config.secure = cfg.secure;
        }
        if(typeof cfg.ip != 'undefined') {
            config.ip = cfg.ip;
        }
        if(typeof cfg.uid != 'undefined') {
            config.uid = cfg.uid;
        }
        if(typeof cfg.autoConnect != 'undefined') {
            config.autoConnect = cfg.autoConnect;
        }
        if(typeof cfg.platform != 'undefined') {
            config.platform = cfg.platform;
        }
        if(typeof cfg.baseOnly != 'undefined') {
            config.baseOnly = cfg.baseOnly;
        }

        if(typeof cfg.port != 'undefined') {
            var port_info = {};
            if(typeof cfg.port.wss != 'undefined') {
                port_info.wss = cfg.port.wss;
            }
            if(typeof cfg.port.ws != 'undefined') {
                port_info.ws = cfg.port.ws;
            }
            if(Object.keys(port_info).length > 0){
                port_list.unshift(port_info);
                config.port = port_list[port_idx];
            }
        }
    }

    var browser = {};
    if(typeof window != 'undefined') {
        if(typeof window.navigator != 'undefined') {
            browser.userAgent = window.navigator.userAgent;
            browser.appVersion = window.navigator.appVersion;
        }
    }

    var callback_list = {};
    var callback_list_idx = 0;
    var listener_list = {};
    var status_listener_list = [];
    var converter = {};

    var WGearBase = 'WGearBase';
    var WGearMessage = 'WGearMessage';

    _addStatusListener(null, null, statusCallback);

    converter.stringToUint = function( str ){
        return new Uint8Array([].map.call(str,function(x){return x.charCodeAt(0)}));
    };
    converter.intToBytes = function( x ){
        var i = 8,
        bytes = [];

        do {
            bytes[--i] = x & (255);
            x = x >> 8;
        } while ( i );

        return bytes;
    };
    converter.bytesToInt = function( ba ){
        var i,
        val = 0;

        for ( i = 0; i < ba.length; ++i ) {
            val += ba[i];
            if ( i < ba.length - 1 ) {
                val = val << 8;
            }
        }

        return val;
    };
    converter.uintToString = function( ua ){
        return String.fromCharCode.apply(null, ua);
    };

    gear_console.log = function () {
        var msg = {
            type : 'Console',
            method : 'Log',
            args : Array.prototype.slice.call(arguments)
        };
        sendData( JSON.stringify(msg) );
    };

    gear_console.error = function () {
        var msg = {
            type : 'Console',
            method : 'Error',
            args : Array.prototype.slice.call(arguments)
        };
        sendData( JSON.stringify(msg) );
    };

    function initialize()
    {
        callback_list = {};
        callback_list_idx = 0;
        listener_list = {};
    };

    function isConnected() {
        if(ws && ws.readyState == WebSocket.OPEN)
            return true;
        else
            return false;
    };

    promise.connect = function() {
        return new Promise(function(resolve, reject) {
            port_idx = 0;
            _connect(resolve, reject);
        });
    };

    callback.connect = function(success, fail) {
        port_idx = 0;
        _connect(success, fail);
    };

    var _connect = function (success, fail) {
        success = success || function() {};
        fail = fail || function() {};

        if(typeof WebSocket == 'undefined') {
            alert('WebSocket is not defined.');
            fail('WebSocket is not defined.');
            return;
        }

        if(ws == null || ws.readyState == WebSocket.CLOSED) {
            if(port_idx == 0) {
                updateStatus('connecting');
            }
            else {
                updateStatus('reconnecting');
            }

            var ip = "127.0.0.1";
            if(config.direct == true) {
                config.secure = false;
                ip = config.ip;
            }

            if(config.secure == true) {
                ws = new WebSocket("wss://" + ip + ":" + config.port.wss + "/wgear");
            }
            else {
                ws = new WebSocket("ws://" + ip + ":" + config.port.ws + "/wgear");
            }

            ws.onopen = function() {
                updateStatus('initializing');
                sendConfigMsg(success, fail);
            };

            ws.onmessage = function ( msg ) {
                if(msg.data instanceof Blob) {
                    var reader = new FileReader();
                    reader.onloadend = function() {
                        _processMessage(reader.result);
                    };
                    reader.readAsBinaryString(msg.data);
                }
                else {
                    _processMessage(msg.data);
                }
            };

            ws.onclose = function (e) {
                if(port_idx < port_list.length - 1) {
                    port_idx++;
                    config.port = port_list[port_idx];

                    _connect(success, fail);
                }
                else {
                    // To support version 1.0
                    if(closed_listener_list) {
                        for(var i = 0; i < closed_listener_list.length; i++) {
                            try {
                                closed_listener_list[i]();
                            } catch(ee) {
                                gear_console.log(ee);
                            }
                        }
                    }
                    initialize();
                    updateStatus('closed');
                    fail();
                }
            };

            ws.onerror = function (e) {
                updateStatus('error');
                initialize();
                fail();
            };
        } else {
            success();
        }
    };

    function _processMessage(data) {
        data = JSON.parse(data);
        switch(data.type) {
            case 'Config':
            case 'LoadLibrary':
            case 'FreeLibrary':
            case 'Function':
            case 'GetProperty':
            case 'SetProperty':
            case 'AddEvent':
            case 'RemoveEvent':
                executCallback( data );
                break;

            case 'Listener':
                executeListener( data );
                break;
        }
    }

    promise.disconnect = function() {
        return new Promise(function(resolve, reject) {
            _disconnect(resolve, reject);
        });
    };

    callback.disconnect = function(success, fail) {
        _disconnect(success, fail);
    }

    var _disconnect = function(success, fail) {
        success = success || function() {};
        fail = fail || function() {};

        if(ws && ws.readyState == WebSocket.OPEN) {
            ws.onclose = function (e) {
                // To support version 1.0
                if(closed_listener_list) {
                    for(var i = 0; i < closed_listener_list.length; i++) {
                        try {
                            closed_listener_list[i]();
                        } catch(ee) {
                            gear_console.log(ee);
                        }
                    }
                }
                updateStatus('closed');
                initialize();
                success();
            };

            ws.onerror = function (e) {
                updateStatus('error');
                initialize();
                fail();
            };
            updateStatus('closing');
            ws.close();
        } else {
            success();
        }
    }

    function updateStatus(status) {
        if(config.status != status) {
            config.status = status;
            switch(config.status) {
                case 'connecting':
                    exec_func_list.length = 0;
                    break;

                case 'open':
                    while(exec_func_list.length > 0) {
                        _exec.apply(this, exec_func_list.shift());
                    };
                    break;

                case 'closed':
                    exec_func_list.length = 0;
                    break;
            }
            if(status_listener_list) {
                for(var i = 0; i < status_listener_list.length; i++) {
                    try {
                        status_listener_list[i](status);
                    } catch(ee) {
                    }
                }
            }
        }
    };

    function sendData(msg) {
        if(ws && ws.readyState == WebSocket.OPEN) {
            ws.send(msg);
        }
    };
    
    function setConfig (msg) {
        if(msg) {
            if(typeof msg.version != 'undefined') {
                config.version.app = msg.version;
            }
            if(typeof msg.modules != 'undefined') {
                config.modules = msg.modules;
            }
            if(typeof msg.project != 'undefined') {
                config.project.name = msg.project;
            }
            if(typeof msg.opmode != 'undefined') {
                config.project.opmode = msg.opmode;
            }
            if(typeof msg.baseOnly != 'undefined') {
                config.baseOnly = msg.baseOnly;
            }
        }
    }

    function sendConfigMsg (success, fail) {
        _exec(function (r) {
            setConfig(r);
            updateStatus('open');
            success();
        }, function (e) {
            gear_console.error('Init error' + e );
            ws.close();
            fail();
        }, "Config", "Config", "Init", [{
                ip : config.ip, port : config.secure ? config.port.wss : config.port.ws, secure : config.secure,
                uid : config.uid, version : config.version.js, direct : config.direct, platform : config.platform,
                browser : browser, baseOnly : config.baseOnly
                }]);
    }

    function executCallback (msg){
        // msg format
        //{
        //  module:msg.module,
        //  method:msg.method,
        //  args:msg.args,
        //  options:msg.options,
        //  error:error,
        //  result:result
        //}
        if(!callback_list[msg.module]) {
            return;
        }
        if(!callback_list[msg.module][msg.method]) {
            return;
        }
        if(!callback_list[msg.module][msg.method][msg.options.cl_uid]) {
            return;
        }
        if(callback_list[msg.module][msg.method][msg.options.cl_uid].fail && msg.error) {
            callback_list[msg.module][msg.method][msg.options.cl_uid].fail(msg.error);
        } else if(callback_list[msg.module][msg.method][msg.options.cl_uid].success){
            callback_list[msg.module][msg.method][msg.options.cl_uid].success(msg.result);
        }
        if(msg.options.cl_uid != 0) {
            callback_list[msg.module][msg.method][msg.options.cl_uid] = null;
        }
    };

    var _exec = function (success, fail, type, module, method, args, options, bin) {
        success = success || function() {};
        fail = fail || function() {};

        if(typeof args == 'undefined') {
            args = args || [];
        }
        options = options || {};
        bin = bin || null;

        if(typeof module == 'undefined' || !module || module.length == 0) {
            fail('module is undefined or empty.');
            return;
        }

        switch(config.status)
        {
            case 'connecting':
            case 'reconnecting':
                exec_func_list.push([success, fail, type, module, method, args, options, bin]);
                return;

            case 'initializing':
                if(type != 'Config') {
                    exec_func_list.push([success, fail, type, module, method, args, options, bin]);
                    return;
                }
                break;
        }

        // check whether args type is array
        if( Object.prototype.toString.call( args ) !== '[object Array]' ) {
           args = [args];
        }
        
        args = JSON.parse(JSON.stringify(args));

        // set callback list.
        options.cl_uid = callback_list_idx.toString();
        callback_list_idx++;
        if(success || fail) {
            if(!callback_list[module]) {
                callback_list[module] = {};
            }
            if(!callback_list[module][method]) {
                callback_list[module][method] = {};
            }
            callback_list[module][method][options.cl_uid] = {"success" : success, "fail" : fail};
        }

        var msg = {
            type : type,
            module : module,
            method : method,
            args : args,
            options : options
        };
        if( typeof options.binary !== 'undefined' && options.binary == true && bin != null ) {
            /*
            message format
            message length, message, binary
            */
            var msgLen;
            msg = JSON.stringify(msg);
            msg = converter.stringToUint(msg);

            msgLen = msg.length;
            msgLen = converter.intToBytes(msgLen);
            msgLen = new Uint8Array(msgLen);

            var binMsg = new Uint8Array(msgLen.length + msg.length + bin.length);
            binMsg.set(msgLen);
            binMsg.set(msg, msgLen.length);
            binMsg.set(bin, msgLen.length + msg.length);

            sendData( new Blob( [binMsg], { type: 'application/octet-binary' } ));
        }
        else {
            sendData( JSON.stringify(msg) );
        }
    };

    promise.exec = function (module, method, args, options, bin) {
        return _promise('Function', module, method, args, options, bin);
    };

    function _promise(type, module, method, args, options, bin) {
        if(isConnected() == false) {
            return promise.connect()
            .then(function (r) {
                return new Promise(function(resolve, reject) {
                    _exec(function(result) {resolve(result);}, function(error) {reject(error);}, type, module, method, args, options, bin);
                });
            }, function (e) {
                return Promise.reject(e);
            });
        }

        return new Promise(function(resolve, reject) {
            _exec(function(result) {resolve(result);}, function(error) {reject(error);}, type, module, method, args, options, bin);
        });
    };

    callback.exec = function (success, fail, module, method, args, options, bin) {
        if(isConnected() == false) {
            callback.connect(function() {
                _exec(success, fail, 'Function', module, method, args, options, bin);
            }, function() {
            });
        }
        else {
            _exec(success, fail, 'Function', module, method, args, options, bin);
        }
    };

    promise.getValue = function (module, property, options) {
        return _promise('GetProperty', module, property, [], options);
    };

    callback.getValue = function (success, fail, module, property, options) {
        _exec(success, fail, 'GetProperty', module, property, [], options);
    };

    promise.setValue = function (module, property, value, options) {
        return _promise('SetProperty', module, property, value, options);
    };

    callback.setValue = function (success, fail, module, property, value, options) {
        _exec(success, fail, 'SetProperty', module, property, [], options);
    };

    promise.open = function (module, options) {
        return _promise("LoadLibrary", module, "", [], options);
    };

    callback.open = function (success, fail, module, options) {
        _exec(success, fail, "LoadLibrary", module, "", [], options);
    }

    promise.close = function (module, options) {
        return _promise("FreeLibrary", module, "", [], options);
    };

    callback.close = function (success, fail, module, options) {
        _exec(success, fail, "FreeLibrary", module, "", [], options);
    }

    function executeListener (msg) {
        if(msg.error) {
            return;
        }
        if(!msg.result) {
            return;
        }
        if(!listener_list[msg.module]) {
            return;
        }
        if(!listener_list[msg.module][msg.method]) {
            return;
        }
        var listeners = listener_list[msg.module][msg.method];
        if(listeners) {
            for(var i = 0; i < listeners.length; i++) {
                try {
                    if( !!msg.bin ) {
                        if(config.spreadEventParams == false) {
                            listeners[i]({result : msg.result, bin : msg.bin});
                        } else {
                            if(Array.isArray(msg.result) == true) {
                                listeners[i].apply(this, msg.result);
                            } else {
                                listeners[i].call(this, msg.result);
                            }
                        }
                    }
                    else {
                        if(config.spreadEventParams == false) {
                            listeners[i](msg.result);
                        } else {
                            if(Array.isArray(msg.result) == true) {
                                listeners[i].apply(this, msg.result);
                            } else {
                                listeners[i].call(this, msg.result);
                            }
                        }
                    }
                } catch(ee) {
                }
            }
        }
    };

    promise.addEventListener = function (module, event, listener, options) {
        return new Promise(function(resolve, reject) {
            _addEventListener(function(result) {resolve(result);}, function(error) {reject(error);}, module, event, listener, options);
        });
    };

    callback.addEventListener = function (success, fail, module, event, listener, options) {
        _addEventListener(success, fail, module, event, listener, options);
    };

    function _addEventListener(success, fail, module, event, listener, options) {
        success = success || function() {};
        fail = fail || function() {};
        module = module || null;
        event = event || null;
        listener = listener || null;
        
        if(module == null || event == null || listener == null || typeof listener != 'function') {
            fail('Input parameters (module, event, listener) are wrong.');
            return;
        }
        
        if(!listener_list[module]) {
            listener_list[module] = {};
        }
        if(!listener_list[module][event]) {
            listener_list[module][event] = [];
        }

        // check whether listener will be added or not.
        for(var i = 0; i < listener_list[module][event].length; i++) {
            if(listener_list[module][event][i] === listener) {
                success('The listener already has been added.');
                return;
            }
        }
        listener_list[module][event].push(listener);

        if(listener_list[module][event].length == 1) {
            _exec(success, fail, 'AddEvent', module, event, [], options);
            return ;
        }
        
        success();
    };

    promise.setEventListener = function (module, event, listener, options) {
        return new Promise(function(resolve, reject) {
            _setEventListener(function(result) {resolve(result);}, function(error) {reject(error);}, module, event, listener, options);
        });
    };

    callback.setEventListener = function (success, fail, module, event, listener, options) {
        _setEventListener(success, fail, module, event, listener, options);
    };

    function _setEventListener(success, fail, module, event, listener, options) {
        success = success || function() {};
        fail = fail || function() {};
        module = module || null;
        event = event || null;
        listener = listener || null;

        if(module == null || event == null || listener == null || typeof listener != 'function') {
            fail('Input parameters (module, event, listener) are wrong.');
            return;
        }

        if(!listener_list[module]) {
            listener_list[module] = {};
        }
        if(!listener_list[module][event]) {
            listener_list[module][event] = [];
        }

        var old_length = listener_list[module][event].length;
        listener_list[module][event].length = 0;
        listener_list[module][event].push(listener);

        if(old_length == 0) {
            _exec(success, fail, 'AddEvent', module, event, [], options);
            return ;
        }

        success();
    };

    promise.removeEventListener = function (module, event, listener, options) {
        return new Promise(function(resolve, reject) {
            _removeEventListener(function(result) {resolve(result);}, function(error) {reject(error);}, module, event, listener, options);
        });
    };

    callback.removeEventListener = function (success, fail, module, event, listener, options) {
        _removeEventListener(success, fail, module, event, listener, options);
    };

    function _removeEventListener(success, fail, module, event, listener, options) {
        success = success || function() {};
        fail = fail || function() {};
        module = module || null;
        event = event || null;
        listener = listener || null;

        if(module == null || event == null || (listener != null && typeof listener != 'function')) {
            fail('Input parameters (module, event, listener) are wrong.');
            return ;
        }

        if(module && listener_list[module]) {
            if(event) {
                if(listener_list[module][event]) {
                    if(listener) { // module, event, listener => remove the listener
                        for(var i = 0; i < listener_list[module][event].length; i++) {
                            if(listener_list[module][event][i] === listener) {
                                listener_list[module][event].splice(i, 1);
                                if(listener_list[module][event].length == 0) {
                                    _exec(success, fail, 'RemoveEvent', module, event, [], options);
                                    return ;
                                }
                            }
                        }
                    }
                }
            }
        }
        // listener_list does not have the event.
        success();
    };

    promise.removeAllEventListener = function (module, event, options) {
        return new Promise(function(resolve, reject) {
            _removeAllEventListener(function(result) {resolve(result);}, function(error) {reject(error);}, module, event, options);
        });
    };

    callback.removeAllEventListener = function (success, fail, module, event, options) {
        _removeAllEventListener(success, fail, module, event, options);
    };

    function _removeAllEventListener(success, fail, module, event, options) {
        success = success || function() {};
        fail = fail || function() {};
        module = module || null;
        event = event || null;

        if(module == null || event == null) {
            fail('Input parameters (module, event) are wrong.');
            return ;
        }

        if(module && listener_list[module]) {
            if(event) {
                if(listener_list[module][event]) {
                    if(listener_list[module][event].length > 0) {
                        listener_list[module][event] = [];
                        _exec(success, fail, 'RemoveEvent', module, event, [], options);
                        return ;
                    }
                }
            }
        }
        // listener_list does not have the event.
        success();
    };

    promise.addStatusListener = function(listener) {
        return new Promise(function(resolve, reject) {
            _addStatusListener(function(result) {resolve(result);}, function(error) {reject(error);}, listener);
        });
    };

    callback.addStatusListener = function(success, fail, listener) {
        _addStatusListener(success, fail, listener);
    };

    function _addStatusListener(success, fail, listener) {
        success = success || function() {};
        fail = fail || function() {};

        if(typeof listener != 'function') {
            fail('Input parameter (listener) was wrong.');
            return;
        }

        for(var i = 0; i < status_listener_list.length; i++) {
            if(status_listener_list[i] === listener) {
                success('The listener already has been added.');
                return;
            }
        }
        status_listener_list.push(listener);
        success();
    };

    promise.setStatusListener = function(listener) {
        return new Promise(function(resolve, reject) {
            _setStatusListener(function(result) {resolve(result);}, function(error) {reject(error);}, listener);
        });
    };

    callback.setStatusListener = function(success, fail, listener) {
        _setStatusListener(success, fail, listener);
    };

    function _setStatusListener(success, fail, listener) {
        success = success || function() {};
        fail = fail || function() {};
        
        if(typeof listener != 'function') {
            fail('Input parameter (listener) was wrong.');
            return;
        }

        status_listener_list.length = 0;
        status_listener_list.push(listener);
        success();
    };

    promise.removeStatusListener = function(listener) {
        return new Promise(function(resolve, reject) {
            _removeStatusListener(function(result) {resolve(result);}, function(error) {reject(error);}, listener);
        });
    };

    callback.removeStatusListener = function(success, fail, listener) {
        _removeStatusListener(success, fail, listener);
    };

    function _removeStatusListener(success, fail, listener) {
        success = success || function() {};
        fail = fail || function() {};
        listener = listener || null;
        if(listener == null) {
            status_listener_list = [];
        }

        if(status_listener_list) {
            for(var i = 0; i < status_listener_list.length; i++) {
                if(status_listener_list[i] === listener){
                    status_listener_list.splice(i, 1);
                }
            }
        }

        success();
    };

    promise.sendMessage = function(fromID, toID, msg, options, bin) {
        // check whether args type is array
        if( Object.prototype.toString.call( toID ) !== '[object Array]' ) {
           toID = [toID];
        }
        return _promise('Function', WGearBase, "Send", [fromID, toID, msg], options, bin);
    };

    callback.sendMessage = function(success, fail, fromID, toID, msg, options, bin) {
        // check whether args type is array
        if( Object.prototype.toString.call( toID ) !== '[object Array]' ) {
           toID = [toID];
        }
        _exec(success, fail, 'Function', WGearBase, "Send", [fromID, toID, msg], options, bin);
    };

    promise.addMessageHandler = function(listener) {
        return new Promise(function(resolve, reject) {
            _addMessageHandler(function(result) {resolve(result);}, function(error) {reject(error);}, listener);
        });
    };

    callback.addMessageHandler = function(success, fail, listener) {
        _addMessageHandler(success, fail, listener);
    };

    function _addMessageHandler(success, fail, listener) {
        success = success || function() {};
        fail = fail || function() {};

        if(typeof listener != 'function') {
            fail('Input parameter (listener) was wrong.');
            return ;
        }

        var module = WGearBase;
        var event = WGearMessage;

        if(!listener_list[module]) {
            listener_list[module] = {};
        }
        if(!listener_list[module][event]) {
            listener_list[module][event] = [];
        }

        // check whether listener will be added or not.
        for(var i = 0; i < listener_list[module][event].length; i++) {
            if(listener_list[module][event][i] === listener) {
                success('The listener already has been added.');
                return ;
            }
        }
        listener_list[module][event].push(listener);

        success();
    };

    promise.setMessageHandler = function(listener) {
        return new Promise(function(resolve, reject) {
            _setMessageHandler(function(result) {resolve(result);}, function(error) {reject(error);}, listener);
        });
    };

    callback.setMessageHandler = function(success, fail, listener) {
        _setMessageHandler(success, fail, listener);
    };

    function _setMessageHandler(success, fail, listener) {
        success = success || function() {};
        fail = fail || function() {};

        if(typeof listener != 'function') {
            fail('Input parameter (listener) was wrong.');
            return ;
        }

        var module = WGearBase;
        var event = WGearMessage;

        if(!listener_list[module]) {
            listener_list[module] = {};
        }
        if(!listener_list[module][event]) {
            listener_list[module][event] = [];
        }

        var old_length = listener_list[module][event].length;
        listener_list[module][event].length = 0;
        listener_list[module][event].push(listener);

        success();
    };

    promise.removeMessageHandler = function(listener) {
        return new Promise(function(resolve, reject) {
            _removeMessageHandler(function(result) {resolve(result);}, function(error) {reject(error);}, listener);
        });
    };

    callback.removeMessageHandler = function(success, fail, listener) {
        _removeMessageHandler(success, fail, listener);
    };

    function _removeMessageHandler(success, fail, listener) {
        success = success || function() {};
        fail = fail || function() {};

        var module = WGearBase;
        var event = WGearMessage;
        
        if(!listener_list[module]) {
            success();
            return ;
        }
        if(!listener_list[module][event]) {
            success();
            return ;
        }
        
        if(listener) { // module, event, listener => remove the listener
            for(var i = 0; i < listener_list[module][event].length; i++) {
                if(listener_list[module][event][i] === listener) {
                    listener_list[module][event].splice(i, 1);
                }
            }
        } else { // module, event, null => remove all listeners in [module][event]
            if(listener_list[module][event].length > 0) {
                listener_list[module][event] = [];
            }
        }

        success();
    };

    promise.setUID = function(id, options) {
        return _promise('Function', WGearBase, "SetUID", [id], options)
        .then( function (r) {
            config.uid = id;
            return Promise.resolve(r);
        }, function (e) {
            return Promise.reject(e);
        });
    };

    callback.setUID = function(success, fail, id, options) {
        success = success || function() {};
        _exec(function () { config.uid = id; success (Array.prototype.slice.call(arguments)); }, fail, 'Function', WGearBase, "SetUID", [id], options);
    };

    promise.getUID = function(options) {
        return _promise('Function', WGearBase, "GetUID", [], options);
    };

    callback.getUID = function(success, fail, options) {
        _exec(success, fail, 'Function', WGearBase, "GetUID", [], options);
    };

    promise.getConnectedList = function(options) {
        return _promise('Function', WGearBase, "GetConnectedList", [], options);
    };

    callback.getConnectedList = function(success, fail, options) {
        _exec(success, fail, 'Function', WGearBase, "GetConnectedList", [], options);
    };

    promise.getUIDList = function(options) {
        return _promise('Function', WGearBase, "GetUIDList", [], options);
    };

    callback.getUIDList = function(success, fail, options) {
        _exec(success, fail, 'Function', WGearBase, "GetUIDList", [], options);
    };

    var getInfo = function() {
        return { version : config.version, secure : config.secure, ip : config.ip, port : config.port, uid : config.uid, modules : config.modules, minVersion : config.minVersion.toFixed(1), status : config.status, project : config.project, baseOnly : config.baseOnly };
    };

    /*
    To support version 1.0
    */
    if(config.minVersion < 2.0) {
        config.autoConnect = false;
    }
    var closed_listener_list = [];

    var addCloseListener = function(module, listener) {
        if(typeof listener == 'function') {
            closed_listener_list.push(listener);
        }
    }

    var removeCloseListener = function(module, listener) {
        listener = listener || null;
        if(listener == null) {
            closed_listener_list = [];
            return ;
        }

        if(closed_listener_list) {
            for(var i = 0; i < closed_listener_list.length; i++) {
                if(closed_listener_list[i] === listener){
                    closed_listener_list.splice(i, 1);
                }
            }
        }
    }

    var getWGearUID = function() {
        return 'Not supported';
    };

    var getVersion = function() {
        config.version;
    };

    // Initialize function
    var doInit = function() {
        if(config.autoConnect == true) {
            _connect();
        }
    };

    doInit();

    if(config.minVersion >= 2.0) {
        return {
            // 2.0 API
            getInfo : getInfo,
            console : gear_console,
            promise : promise,
            callback : callback
        };
    }
    else if(config.minVersion >= 1.0 ) {
        return {
            // 1.0 API
            connect : promise.connect,
            disconnect : promise.disconnect,
            exec : callback.exec,
            promise : promise.exec,
            getValue : promise.getValue,
            setValue : promise.setValue,
            open : promise.open,
            close : promise.close,
            create : promise.connect,
            destroy : promise.disconnect,
            addEventListener : promise.addEventListener,
            removeEventListener : promise.removeEventListener,
            addCloseListener : addCloseListener,
            removeCloseListener : removeCloseListener,
            sendMessage : promise.sendMessage,
            addMessageHandler : promise.addMessageHandler,
            removeMessageHandler : promise.removeMessageHandler,
            setBrowserID : promise.setUID,
            getBrowserID : promise.setUID,
            getWGearUID : getWGearUID,
            getVersion : getVersion,

            // 2.0 API
            getInfo : getInfo,
            console : gear_console,
            promise : promise,
            callback : callback
        };
    }
    else {
        return {
            // 2.0 API
            getInfo : getInfo,
            console : gear_console,
            promise : promise,
            callback : callback
        };
    }
}
