"use strict";

/*
  websocket & webchannel updown
*/
var WebSocket = require('faye-websocket');
var QWebChannel = require('./qwebchannel.js').QWebChannel;
var io = require('socket.io');
var devwrapper = null, wcClient;
var webChannelLinked = false;

var wsServers = [];
var clientCount = 0;

//socket.io模式连接前端，作为server
var wsServerCreate = function(server, onWsClientMessage, onDevCommand, onStart)   {
    io = io.listen(server);     //or sio = io(server);
    io.on('connection', function(socket)    {
        //连接成功后，挂接接收处理函数
        socket.on('message', function(data, callback) {     //一般，test用
            onWsClientMessage(data, callback);
        });
        socket.on('devCommand', function(data, callback)    {   //处理向后端的的devCommand命令，利用callback机制
            if (devwrapper !== null)    {
                var param = [];
                if (data.param !== undefined)    {
                    param = JSON.parse(data.param);
                }
                onDevCommand(data.command, param, callback);
//                doDevCommand(data.command, param, callback);
            }
        });
        //多终端管理
        clientCount++;
        if (onStart !== undefined && clientCount===1)  {
            onStart();
        }
        socket.on("disconnect", function()  {
            if (clientCount >1) {
                io.sockets.emit("connected", {"clientId": clientCount, "event_up": false});    //广播
            }
            clientCount--;
        });
//        socket.emit("connected", clientCount);
        io.sockets.emit("connected", {"clientId": clientCount, "event_up": true});    //广播
    });
}


//后端webchannel连接
function linkWebchannel(onDeviceEvents)   {
    if (devwrapper !== null)
        return;
    wcClient = new WebSocket.Client('ws://127.0.0.1:2285/');
    wcClient.on('open', function(event) {
        var transport = {
            send: function(data) {
                wcClient.send(data)
            }
        };
        var channel_1 = new QWebChannel(transport, function(channel) {
            devwrapper = channel.objects.devwrapper;
            if (devwrapper === undefined)    {
                console.log("Device Wrapper undefined");    //会出现!
                return;
            }
            //挂接devwrapper对象的属性/事件/方法，方法可全局执行
            devwrapper.deviceEvent.connect(onDeviceEvents);
            webChannelLinked = true;
        });
        wcClient.on('message', function(event) {
            transport.onmessage(event);
        });
    });

    wcClient.on('error', function(error) {
        console.log('Webchannel error: ' + error.message);
    });
    wcClient.on('close', function() {
        console.log('Webchannel close.');
    });
}

//向底层QT端发devCommandd命令
var doDevCommand = function(cmd, param, callback) {
    if (devwrapper !== null)    {
        if (callback !== undefined)
            devwrapper.doCommand(cmd, param, callback);
        else
            devwrapper.doCommand(cmd, param);
    }
}

//向前端发message。（广播式，进一步要考虑权限，一对一发)
var wsSeverNotify = function(jo)    {
    io.sockets.emit("message", jo);
}

function getClientCount()   {
    return(clientCount);
}

module.exports =    {
    wsServerCreate: wsServerCreate,
    wsSeverNotify: wsSeverNotify,
    getClientCount: getClientCount,

    webChannelLinked : webChannelLinked,
    linkWebchannel: linkWebchannel,
    doDevCommand: doDevCommand
}
