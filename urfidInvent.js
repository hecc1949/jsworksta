/*
  标签点验（盘点）功能实现
 */

var _view2deviceDis = true;    //界面参数人工更改时，不update到设备。避免inventSpeed选择时，从设备读参数再更改回设备的loop.
var inventRuning = false;
var inventTabViewCursor = 0;
var inventGroupId = -1;

//--------- views ---
//$(function inventViewEvents()   {
function inventViewEvents()   {
    //datagrid显示分页
    $("#inventTab").datagrid('getPager').css({height:"30px"});
    $("#inventTab").datagrid({      //pageSize要和pageList一起使用，且为pageList的最小值
        pageSize: 15,
        pageList: [15, 30, 45, 60],
        onLoadSuccess: function()   {
            var pagesize = $(this).datagrid("options").pageSize;
            var cursor = inventTabViewCursor % pagesize;
            if (cursor>=0)
                $(this).datagrid("selectRow", cursor);
        }
    });
    $("#inventTab").datagrid('getPager').pagination({
        layout: ['sep','first','prev','links','next','last','sep','refresh','info']
    });

    //扫描速度选择框
    $("#inventSpeed").combobox({
        onSelect:function(rec) {
            if (!_view2deviceDis)   {
                doDevCommand("inventSetScanPeriod",[parseInt(rec.value)]);      //
            }
        }
    });

    //点验执行
    $("#btnInventRun").bind('click', runInvent);

    $("#btnInventMode").linkbutton("disable");
    $("#btnInventMode").linkbutton({
        onClick: function() {
            doDevCommand("inventToggleMode",[], function(jores)  {
                $("#btnInventMode").linkbutton("disable");
            });
        }
    });

    $("#btnInventNewGrp").linkbutton({
        onClick: function() {
            if (!inventRuning)  {
                doDevCommand("inventSetGroupId",[-1]);
            }
        }
    });
    $("#grptags").datalist({      //pageSize要和pageList一起使用，且为pageList的最小值
        onLoadSuccess: function()   {
            if (inventGroupId>=0)
                $(this).datalist("selectRow", inventGroupId);
        }
    });

    $("#btnInventReport").linkbutton({
        onClick: function() {
            if (!inventRuning)  {
                doWithPasswd("结束点验，下载数据", function(passwd)  {
                    var jo = {"command":"inventReport","clientId":_clientId, "password":passwd   };
                    sendAjaxCommand("commands", jo, function(dat) {     //inventReport命令通知后台准备数据文件，返回文件名；
                        if (dat.result === true && dat.filename.length>0)   {
                            filedownload(dat.filename);
                            $("#statusBar").text("数据保存在文件："+ filebasename(dat.filename));
                        }
                        else    {
                            $.messager.alert('错误','命令执行失败: 没有可用数据','info');
                        }
                    });
                });
            }
        }
    });
}
//});

//-------------- sub utils ---------------
function clearInventPanel() {
//    doDevCommand("inventSetGroupId",[0]);
    $("#inventTab").datagrid('getPager').pagination('select',1);    //清pageNumber
    $("#inventTagCount").textbox('setValue', "");
    $("#inventUnFmtTagCount").textbox('setValue', "");
    $("#inventCrosGrpCount").textbox('setValue', "");
    $("#inventGroupedCount").textbox('setValue', "");
    $("#inventRunCount").textbox('setValue', "");
}

//------------ dev-events ---
//进入点验界面时执行的动作
function onInventDevStart()     {
    doDevCommand("selectInventMode",[true], function(joRes)  {
        if (!joRes.result)    {
            $.messager.alert('设备故障','读写卡模块模式切换失败!','error');
        }
        else    {
            isInventMode = true;
            doDevCommand("inventGetScanPeriod",[], function(joRes)  {
                var val = joRes.data[0].inventScanPeriod;
                _view2deviceDis = true;
                $("#inventSpeed").combobox('select', val);
                _view2deviceDis  = false;
                //
                sendAjaxCommand("commands", {"command":"loadWorkingDat", "param":[1]});     //加载旧数据
            });
        }
    });
}

//硬件相关设备发出的devMessage
function onInventDevMsg(jo) {
    if (jo.scanMultiHit !== undefined)  {       //扫描模式切换
        if (jo.scanMultiHit !== 0)   {
            $("#btnInventMode").linkbutton({"text":"普通扫描"});
        }   else    {
            $("#btnInventMode").linkbutton({"text":"精细扫描"});
        }
        if (_clientId===1)
            $("#btnInventMode").linkbutton("enable");
    }
    if (jo.scanTick !== undefined)  {           //扫描tick计数
        $("#inventRunCount").textbox('setValue', jo.scanTick);
    }
}

//数据更新时，刷新显示
function doInventViewUpdate(jo) {
    if (jo.inventCursorRow !== undefined)   {
        inventTabViewCursor = jo.inventCursorRow;
        setGridviewCursor($("#inventTab"), inventTabViewCursor);
    }
    if (jo.frameTags !== undefined)    {        //分组(书架)标签
        inventGroupId = parseInt(jo.frameTags);
        $("#grptags").datalist("reload");
    }
    //
    if (jo.foundTags !== undefined) {
        $("#inventTagCount").textbox('setValue', jo.foundTags);
    }
    if (jo.contextInvalidTags !== undefined)  {
        $("#inventUnFmtTagCount").textbox('setValue', jo.contextInvalidTags);
    }
    if (jo.groupedTags !== undefined)    {
        $("#inventGroupedCount").textbox('setValue', jo.groupedTags);
    }
    if (jo.crossGrpCount !== undefined) {
        $("#inventCrosGrpCount").textbox('setValue', jo.crossGrpCount);
    }
}

//启动-停止点验动作
function runInvent()    {
    if (_clientId !==1)
        return;
    $('#mainwin').layout('collapse', 'west');   //关闭左侧菜单栏
    if ($("#grptags").datalist('getRows').length ===0)  {
        doDevCommand("inventSetGroupId",[-1]);  //首次执行，自动开一个新分组
    }    

    var scanmode = 0;   //0-自动切换普通/精细模式，也可手动； 1-普通模式，可手动切换； 2-精细模式，可手动切换
    if ($("#inventSpeed").combobox('getValue') < 200)   {
        scanmode = 2;
    }
    doDevCommand("inventRun",[!inventRuning, scanmode], function(joRes)    {
        if (joRes.result)   {
            //界面显示更新
            if (joRes.data[0].active)   {
                $("#btnInventRun").linkbutton({"text":"停止"});
                $("#btnInventNewGrp").linkbutton("disable");
                $("#inventSpeed").combobox("disable");
                $("#btnInventFinish").linkbutton("disable");
                if (_clientId===1)
                    $("#btnInventMode").linkbutton("enable");
                if (joRes.data[0].scanMultiHit)     {
                    $("#btnInventMode").linkbutton({"text":"普通扫描"});
                }   else    {
                    $("#btnInventMode").linkbutton({"text":"精细扫描"});
                }
            }
            else {
                $("#btnInventRun").linkbutton({"text":"点验"});
                $("#btnInventMode").linkbutton("disable");
                if (_clientId===1)  {
                    $("#btnInventNewGrp").linkbutton("enable");
                    $("#inventSpeed").combobox("enable");
                    $("#btnInventFinish").linkbutton("enable");
                }
            }
            $("#inventRunCount").textbox('textbox').focus();        //设置焦点离开。datagrid不能设焦点
            inventRuning = joRes.data[0].active;
        }
    });
}


