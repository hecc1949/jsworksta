/*
    综合功能模块
 */

//---------------- 通信接口命令封装,全局 websocket/webchannel interfaces -----------------------
var _clientId = 0;
var ioClient = null;
//socket.io client连接
//$(function startSocketIo()  {
function startSocketIo()  {
    ioClient = io.connect();
    ioClient.on("message", function(data)   {       //通用信息接收
        onDeviceEvents(data);
    });
    ioClient.on("connected", function(data)    {    //本机登录，自定义的启动消息，server端建立连接后发出
        var id = parseInt(data.clientId);
        if (_clientId <1 && data.event_up===true && id>_clientId)   {
            _clientId = parseInt(data.clientId);
            if (_clientId >1)
                $("#statusBar").text("客户端-"+String(id)+"登录.");
            devicesInit();      //初始化动作
        }
        else    {
            if (data.event_up === true)
                $("#statusBar").text("客户端-"+String(id)+"登录.");
            else
                $("#statusBar").text("客户端-"+String(id)+"退出登录.");
        }
    });
    ioClient.on("disconnect", function(data)    {
        if (_clientId !== 1)    {
            window.open('about:blank','_self').close();     //关闭页面
        }
    });
}
//});

//发送ajax命令。所有client都可以用。
function sendAjaxCommand(cmd_url, jo, callback)    {
    $.ajax({
        url: cmd_url,
        type: "get",
        dataType: 'json',
        data: jo,
        success:function(dat)   {            
            if (callback !== undefined && typeof callback === 'function') {
                callback(dat);
            }
            else    {
                if (dat.result !== true)    {
//                    console.log("ajax return:"+JSON.stringify(dat));
                    $.messager.alert("错误", "命令执行失败: 权限或参数错误",'error');
                }
            }
        },
        error: function(XMLHttpRequest, textStatus, errorThrown)    {
            $.messager.alert("错误", "命令发送失败:" + XMLHttpRequest);
        }
    });
}

//前端发送控制命令。通过/devCommands路由实现device控制命令。只有_clientId=1能用。
function doDevCommand(cmd, param, callback) {
//    var jo = {'command':cmd, 'param': JSON.stringify(param)};
    var jo = {'command':cmd, 'param': JSON.stringify(param), "clientId": _clientId};
    sendAjaxCommand("/devCommands", jo, callback);       //ajax模式
    //socket.io模式
/*#    if( ioClient !== null)  {
        if (callback !== undefined)
            ioClient.emit("devCommand", jo, callback);
        else
            ioClient.emit("devCommand", jo);
    }
*/
}

//设备端发来的webchannel event消息分发
function onDeviceEvents(joRes)    {    
    if (joRes.event ==='inventMsg')   {
        onInventDevMsg(joRes.param[0]);
    }
    else if (joRes.event ==='inventUpdate')    {
        doInventViewUpdate(joRes.param[0]);
    }
    else if (joRes.event === 'tagwrMsg')    {
        onTagwrDevMsg(joRes.param[0]);
    }
    else if (joRes.event === 'findTagUpdate')    {
        onfindTagUpdate(joRes.param[0]);
    }
}

//请求输入密码，然后执行
function doWithPasswd(title, fn)    {
    if (_clientId ===1)     {
        if (fn !== undefined)   {
            fn();
        }
    }
    else    {
        $.messager.password(title, '请输入工作密码：', function(r)  {
            if (r)  {
                if (fn !== undefined) {
                    fn(r);
                }
            }
        });
    }
}

//----------------- 全局views ------------------

function devicesInit()   {
    if (_clientId ===1)  {
        doDevCommand("openURfidWitor",[1, true], function(joRes)   {
            if (!joRes.result)   {      //失败
                $("#barcodeInput").textbox('disable');
                $("#btnFindTag").linkbutton("disable");
                $("#btnInventRun").linkbutton("disable");
            }
            else    {
                onInventDevStart();     //点验计数界面
            }
        });
    }
    else    {
        $("#btnInventRun").linkbutton("disable");
//        $("#btnInventMode").linkbutton("disable");
        $("#inventSpeed").combobox("disable");
        $("#btnInventNewGrp").linkbutton("disable");

        $("#barcodeInput").textbox('disable');
        $("#btnFindTag").linkbutton("disable");
        $("#selWrtagFast").switchbutton("disable");

//        $("#btnClose").linkbutton("disable");
    }
}

//全局界面初始化, main()
$(function setupViewStyle()  {
    //全部界面控件的style补充，在css文件中做不了的设置在此实现
    $("#genClock").textbox('textbox').css({fontSize: "2.0em", fontWeight:"bold",
        color:"blue", textAlign:'center',
        backgroundColor: 'rgb(122,155,220)',
        height:'50px',
        marginTop : '0px'});

    $(".easyui-linkbutton").linkbutton({
        height: '36px'      //or: size: 'large'
        });     //所有button设置高度。

    //标题栏
    $("#banner").click(function()   {
        if (_clientId <=1) {
            doDevCommand("sysShowToolbar",[5000]);  //鼠标移上来时显示本机工具条
        }
    });
    //主菜单
    $("#functionMenu").accordion({ onSelect: functionsMain    });

    //写标签界面的text控件
    $("#barcodeInput").textbox('textbox').css({ fontSize: "1.5em", fontWeight:"bold",color:"blue"   });
//    $("#usingTag").textbox('textbox').css({ fontSize:'1.1em', backgroundColor: 'rgb(225, 231, 206)' });
    $("#usingTag").textbox('textbox').css({ fontSize:'1.2em', backgroundColor: 'rgb(225, 231, 206)' });

    $("#writedCount").textbox('textbox').css({  fontSize: "1.8em", fontWeight:"bold",color:"blue"   });
    $("#killCount").textbox('textbox').css({    fontSize: "20pt", fontWeight:"bold",color:"black"   });
    //点验界面
    $("#inventTagCount, #inventRunCount").each(function()   {
        $(this).textbox('textbox').css({fontSize: "1.5em", fontWeight:"bold",color:"blue"});
    });
    $("#inventUnFmtTagCount, #inventGroupedCount,#inventCrosGrpCount").each(function()   {
        $(this).textbox('textbox').css({fontSize: "1.2em", fontWeight:"bold",color:"black"});
    });

    $("#inventSpeed").combo('textbox').css({fontSize: "1.2em"});    //扫描速度选择框
    //分项功能初始化
    initMiscViews();
    inventViewEvents();
    initWrtagViews();
    //socket.io()连接上后-->devicesInit()，在此之前所有devCommand动作将因_clientId未定义而被屏蔽！
    startSocketIo();
});

//"系统配置"页的功能实现
function initMiscViews()  {
    //系统配置页面
    sendAjaxCommand("commands", {"command":"miscGetSysConfigs", "param":[]}, function(joRes)    {
        $('#configSettings').propertygrid('loadData', joRes.data);
    });
    $("#configApply").linkbutton({
        onClick: function() {
            var rows = $("#configSettings").propertygrid('getChanges');
            doWithPasswd("更改系统配置", function(passwd)  {
                var jo = {"command":"miscSetSysConfigs", "param":JSON.stringify(rows),
                            "clientId":_clientId, "password":passwd   };
                sendAjaxCommand("commands", jo, function(joRes)   {
                    var updCnt = joRes.data[0].updateCount;
                    if (updCnt>0)   {
                        sendAjaxCommand("commands", {"command":"miscGetSysConfigs", "param":[]}, function(joRes2)    {
                            $('#configSettings').propertygrid('loadData', joRes2.data);
                        });
                        $.messager.alert('执行命令', "更新系统配置： "+updCnt+"项",'info');
                    }
                });
            });
/*
            doDevCommand("miscSetSysConfigs", rows, function(joRes) {
                var updCnt = joRes.data[0].updateCount;
                if (updCnt>0)   {
                    $("#configApply").linkbutton("disable");
                    setTimeout(function() {
                        sendAjaxCommand("commands", {"command":"miscGetSysConfigs", "param":[]}, function(joRes)    {
                            $('#configSettings').propertygrid('loadData', joRes.data);
                        });
                        $("#configApply").linkbutton("enable");
                    }, 3000);
                    $.messager.alert('执行命令', "更新系统配置： "+updCnt+"项",'info');
                }
            });
*/
        }
    });
    $("#btnClose").linkbutton({
        onClick: function() {
            if (_clientId ===1) {
                $.messager.confirm({title:'主机关机', msg: '确定要退出系统，关闭主机？',
                    fn: function(r){
                        if (r)  {
                            doDevCommand("sysClose",[_clientId]);
                        }
                    }
                });
            }
            else    {
                window.open('about:blank','_self').close();     //关闭页面
            }
        }
    });
}

var isInventMode = true;
var mnuContextPanel, mnuToolPanel;
//应用页切换
function functionsMain(title, index)    {
    if (!mnuContextPanel)   {
        mnuContextPanel = ["inventPanel", "wrtagPanel", "configPanel"];
    }
    if (!mnuToolPanel)  {
        mnuToolPanel = ["inventTools","wrtagTools", ""];
    }

    if (index<0 || index>2)
        return;
    $("#wrtagPanel, #inventPanel, #configPanel").each(function()    {
        if ($(this).attr('id') === mnuContextPanel[index] ) {
            $(this).panel("open");
        }   else    {
            $(this).panel("close");
        }
    });
    $("#wrtagTools, #inventTools").each(function()    {
        if ($(this).attr('id') === mnuToolPanel[index] ) {
            $(this).panel("open");
        }   else    {
            $(this).panel("close");
        }
    });

    //
    if (index===2)  {
        //刷新，对网络状态有必要
        sendAjaxCommand("commands", {"command":"miscGetSysConfigs", "param":[]}, function(joRes)    {
            $('#configSettings').propertygrid('loadData', joRes.data);
        });
        doDevCommand("sysImeEnable",[true]);
    }
    else    {
        doDevCommand("sysImeEnable",[false]);
        //停止动作
        if (index !==0 && inventRuning)  {
            runInvent();    //stop
        }
        if (index !==1 && scanRuning)    {
            runFindTag();   //stop
        }
        //读写器模式切换
        if ((index===1 && isInventMode)||(index===0 && !isInventMode))  {
            var selInvent = (index===0);
            doDevCommand("selectInventMode",[selInvent], function(joRes)  {
                if (!joRes.result)    {
                    $.messager.alert('设备故障','读写卡模块模式切换失败!','error');
                    if (selInvent)
                        $("#functionMenu").accordion('select', 0);
                    else
                        $("#functionMenu").accordion('select', 1);
                }   else    {
                    isInventMode = selInvent;
                    if (index===1)  {
                        clearWrTagPanel();                        
                        sendAjaxCommand("commands", {"command":"loadWorkingDat", "param":[0]});
                    }
                }
            });
        }
    }
}

