/**
  * UHF-RFID 图书标签制作
  *
  */
//全局变量
window.channel = null;
window.devwrapper = null;       //这个先于qwebchannel初始化，界面初始化时qwebchannel未打开，有必要用这个判断

var mWritedCount = 0;
var hotWriteObj = {
    barcode: "",
    epc: "",
    poolId:-1,
    tagSerial:"",
    reqEpcBits:96,
    barcodeRepeat:false
};

var isInventMode = true;
var barcodeNewline = false, scanRuning = false, inventRuning = false;

var wrEventBuf = [];


var m_locfile_mediaPath = "";
var m_setting;

//界面初始化。等效于放在$(document).ready((function()  {    }) 中
$(function initViews()  {
    //条码输入框，设置不能用css配置的style
    $("#barcodeInput").textbox('textbox').bind('keydown', onBarcodeInput);      //event连接。jquery执行环境

   //条码-标签状态提示框。是普通input。style用css设置，readonly用jQuery设置
    $("#barcodeStatus").attr("readonly", true);
    $("#barcodeStatus").val("");
    $("#barcodeStatus").focus(function() {                  //调整成不能获得焦点的模式
        $("#barcodeInput").textbox('textbox').focus();
    });

    //当前选择&写的标签号。只读
    $("#usingTag").textbox('textbox').focus(function()  {
        $("#barcodeInput").textbox('textbox').focus();
    });

    //找到标签表格
    $("#foundtagTab").datagrid({
        onSelect: function(index, row)  {       //手工选择标签
            if (!scanRuning)    {
                if (hotWriteObj.barcode.length>0)   {
                    $("#barcodeStatus").val("选择标签");
                    if (row.usingmode === "完整读出" && row.epcBits >=hotWriteObj.reqEpcBits)  {
                        hotWriteObj.poolId = index;
                        hotWriteObj.tagSerial = row.tagSerial;
                        $("#usingTag").textbox('setValue', row.epc);
                        $("#btnWriteTag").linkbutton('enable');
                    }   else    {
                        hotWriteObj.poolId = -1;
                        $("#usingTag").textbox('setValue', "");
                    }
                }
                $("#btnKillTag").linkbutton('enable');
            }
        }
    });      
    //写标签计数, 灭活计数
    $("#writedCount").textbox('textbox').focus(function()  {
        $("#barcodeInput").textbox('textbox').focus();
    });
    //写入事件记录表格
    $("#wrEventTab").datagrid({loadFilter: pagerFilter});

    //工具栏按钮
    $("#btnFindTag").bind('click', runFindTag);
    $("#btnWriteTag").linkbutton({
        disabled: true,
        //写入动作A: 按界面button手动写入
        onClick: writeTag
    });
    $("#btnKillTag").linkbutton({onClick: killTag, disabled: true});

    //页面载入，设置焦点
    $("#barcodeInput").next('span').find('input').focus();
});

//webchannel全局对象加载
$(function()    {
    if (qt === undefined || qt.webChannelTransport === undefined)    {
        return;
    }
    window.channel = new QWebChannel(qt.webChannelTransport, function(channel) {
        window.devwrapper = channel.objects.urfidWrapper;
        devwrapper.onDeviceEvent.connect(onDeviceEvents);       //前置

        doDevCommand("openURfidWitor",[1, true], function(joRes)   {
            if (!joRes.result)   {
                $("#barcodeInput").textbox('disable');
                $("#btnFindTag").linkbutton("disable");
                $("#btnInventRun").linkbutton("disable");
            }   else    {
                onInventDevStart();
            }
        });

/*
        devwrapper.openURfidWritor(1, true, function(res) {     //0-写标签模式，1-点验模式
            if (!res)   {
                $("#barcodeInput").textbox('disable');
                $("#btnFindTag").linkbutton("disable");
                $("#btnInventRun").linkbutton("disable");
            }

            onInventDevStart();
        });

       devwrapper.writedCountChanged.connect(function()    {
            mWritedCount = devwrapper.writedCount;
            $("#writedCount").textbox('setValue', mWritedCount);
            $("#killCount").textbox('setValue', devwrapper.killCount);
        });

        devwrapper.promptMessageUpdate.connect(function(level)    {
            if (level >=0)   {
                $("#statusBar").text(devwrapper.promptMessage);
            }
        });
*/
        //读写器event连接到处理函数
        //写标签功能
/*        devwrapper.findTagTick.connect(onfindTagTick);
        devwrapper.findTagUpdate.connect(onfindTagUpdate);  */
        //点验功能
//        inventDevEventLink();

        //一般配置，读出
        miscDevEventLink();
    });
});

//webchannel event消息分发
function onDeviceEvents(joRes)    {
    if (joRes.event ==='inventMsg')   {
        onInventDevMsg(joRes.param[0]);
    }
    else if (joRes.event==='inventTagCapture')  {
        onInventTagUpdate(joRes.param[0]);
    }
    else if (joRes.event === 'tagwrMsg')    {
        onTagwrDevMsg(joRes.param[0]);
    }
    else if (joRes.event === 'findTagUpdate')    {
        onfindTagUpdate(joRes.param[0]);
    }
}

function doDevCommand(cmd, param, callback) {
    if (devwrapper !== null)    {
        if (callback !== undefined)
            devwrapper.doCommand(cmd, param, callback);
        else
            devwrapper.doCommand(cmd, param);
    }
}


function onTagwrDevMsg(jo)  {
    if (jo.writedCount !== undefined)  {
        $("#writedCount").textbox('setValue', jo.writedCount);
    }
    if (jo.killCount !== undefined)  {
        $("#killCount").textbox('setValue', jo.killCount);
    }
    if (jo.dbMessage !== undefined && jo.dbMessageLevel !== undefined)  {
        if (jo.dbMessageLevel >=0)   {
            $("#statusBar").text(jo.dbMessage);
        }
    }
    if (jo.findTagTick !== undefined)   {
        onfindTagTick(jo.findTagTick);
    }
}
//------------------


function clearWrTagPanel()  {
    $("#foundtagTab").datagrid('loadData', {total:0, rows:[]});     //清空列表
    wrEventBuf.length = 0;
    $("#wrEventTab").datagrid('loadData', {total:0, rows:[]});     //
    $("#wrEventTab").datagrid('getPager').pagination('select',1);

    $("#barcodeInput").textbox('setValue', "");
    $("#usingTag").textbox('setValue', '');
    $("#btnWriteTag").linkbutton('disable');
    $("#btnKillTag").linkbutton('disable');
    $("#barcodeInput").next('span').find('input').focus();
    hotWriteObj.barcode = "";
    hotWriteObj.poolId = -1;    
}

//---------------------- 写标签功能 ---------------------------------------------

//扫描枪输入
function onBarcodeInput(e)  {    
    var barcode = $(this).val();        //取当前值。用$("id").textbox('getValue')取的不可靠
    if (e.keyCode === 13){	// 当按下回车键时接受输入的值。
        barcodeNewline = true;
/*        devwrapper.checkBarcodeValid(barcode, function(restype) {
  */
        doDevCommand("tagCheckBarcode",[barcode], function(joRes)   {
            var restype = joRes.data[0].reqTagType;
            var tagtype = Math.abs(restype);
            //返回值: 0-错误，1-要96bit标签，2-128bit标签，3-144bit以上标签。 负值为条码已写过，重复。
            if (tagtype >=1 && tagtype <=3) {
                if (restype>0)  {
                    if (restype===1)
                        $("#barcodeStatus").val("条码合规格");
                    else if (restype===2)
                        $("#barcodeStatus").val("条码要求128bit标签");
                    else
                        $("#barcodeStatus").val("条码要求144位以上标签");
                    hotWriteObj.barcodeRepeat = false;
                }   else    {
                    $("#barcodeStatus").val("条码重复");
                    hotWriteObj.barcodeRepeat = true;
                }
/*                devwrapper.epcEncode(barcode, tagtype, function(epc)    {   //return在callback中
                    hotWriteObj.barcode = barcode;
                    hotWriteObj.epc = epc;
  */
                doDevCommand("tagEpcEncode",[barcode, tagtype], function(joRes)   {
                    hotWriteObj.barcode = barcode;
                    hotWriteObj.epc = joRes.data[0].epc;
                    if (tagtype ===1)
                        hotWriteObj.reqEpcBits = 96;
                    else if (tagtype ===2)
                        hotWriteObj.reqEpcBits = 128;
                    else
                        hotWriteObj.reqEpcBits = 144;

                    if (scanRuning)     {
                        runFindTag();        //stop                        
                    }   else   {
                        if (hotWriteObj.poolId>=0 && restype>0)  {      //条码重复则不启动写，但重新找标签
//                            $("#usingTag").textbox('setValue', epc);
                            $("#usingTag").textbox('setValue', joRes.data[0].epc);
                            //写入动作C： 条码输入时已经找到空白标签，不在扫描状态(手动开启的），启动写入
                            writeTag();
                        }   else    {
                            runFindTag();   //start
                        }
                    }
                });
            }   else    {
                $("#barcodeStatus").val("条码错误");
                $("#barcodeInput").textbox('textbox').focus();
                return;
            }
        });
    }   else    {
        //新输入：扫描下一个条码
        if (barcodeNewline) {
            barcodeNewline = false;
            $("#barcodeInput").textbox('setValue', "");
            $("#barcodeStatus").val("");
            $("#usingTag").textbox('setValue', "");
            hotWriteObj.barcode = "";
            hotWriteObj.epc = "";
        }
    }           
}

//启动查找待写标签
function runFindTag() {
    if (!scanRuning)    {   //start
        hotWriteObj.poolId = -1;        //不可快写
        $("#foundtagTab").datagrid('loadData', {total:0, rows:[]});     //清空列表
        $("#usingTag").textbox('setValue', '');
        $("#btnWriteTag").linkbutton('disable');
        $("#btnKillTag").linkbutton('disable');
//        devwrapper.findTagsForWrite(true, function(res) {
//            if (res)    {       //启动成功
        doDevCommand("tagFindValid",[true], function(joRes)   {
            if (joRes.result)    {       //启动成功
                scanRuning = true;
                $("#btnFindTag").linkbutton({"text": "停止"});
            }
        });
        $("#statusBar").text(' ');      //清prompt信息显示
    }    else  {        //stop
//        devwrapper.findTagsForWrite(false, function(res) {
//            if (res)    {       //停止成功
        doDevCommand("tagFindValid",[false], function(joRes)   {
            if (joRes.result)    {       //停止成功
                scanRuning = false;
                $("#btnFindTag").linkbutton({"text": "查找标签"});
                $("#usingTag").textbox('setValue', '');
                $("#barcodeStatus").val("等待标签");
//                $("#barcodeInput").textbox('textbox').focus();  //光标，等条码输入
            }
        });
    }
    $("#barcodeInput").textbox('textbox').focus();  //光标，等条码输入
}

var tagCheckType = [{val:0, status:"未读出内容"},
    {val:3, status: "密码未知"},
    {val:7, status: "完整读出"},
    {val:15, status: "新写"}];
//event响应：在列表中显示找到的标签（制作模式）
function onfindTagUpdate(jo)    {
    var rec = {         //定义datagrid显示proto
        itemid: 0,
        hitCount: 1,
    };
    //#不是每次都把所有字段发过来。只有部分字段时，rec的对应字段被赋值为undefined, 不影响送显示;但要经过运算赋值的，则要判断undefined.
    var rowid = jo["id"];
    rec.itemid = rowid + 1;
    rec.hitCount = jo["hitCount"];

    var rdmask = jo["rdmask"];
    if (rdmask !== undefined)   {
        rec.usingmode = "未知";
        for(var i=0; i<tagCheckType.length; i++)   {
            if (rdmask === tagCheckType[i].val) {
                rec.usingmode = tagCheckType[i].status;
                    break;
            }
        }
    }
    if (jo["fmtId"] !== undefined)  {
        if (jo["fmtId"] <0) {
            rec.format = "空白";
        }   else if (jo["fmtId"] ===0)  {
            rec.format = "标准格式";
        }   else    {
            rec.format = "格式" + jo.fmtId;
        }
    }

    rec.epc = jo.epc;
    if (jo.epcSize !== undefined)
        rec.epcBits = jo.epcSize*8;
//#    rec.tagPc = jo.epcPC;
    rec.context = jo.barcode;
    rec.tagserial = jo.serialNo;
    if (jo.accessPwd !== undefined && jo.killPwd !== undefined) {
//#        rec.passwd = jo.accessPwd;
        rec.passwd = jo.accessPwd + "/" + jo.killPwd;
    }
    //提交显示
    if (rowid >= $("#foundtagTab").datagrid('getRows').length)  {
        $("#foundtagTab").datagrid('appendRow', rec);
    }   else {
        $("#foundtagTab").datagrid('updateRow', {index: rowid, row: rec });
    }
}

//event响应：读写器扫描待写标签发出的event
function onfindTagTick(count)    {
    if (count<0)    {
        //搜索停止
        $("#btnFindTag").linkbutton({"text": "查找标签"});
        if ($("#foundtagTab").datagrid('getRows').length>0) {
            $("#btnWriteTag").linkbutton('enable');
            $("#btnKillTag").linkbutton('enable');
        }
        if (scanRuning) {
            var validId = -1;
            var rows = $("#foundtagTab").datagrid('getRows');
            for(var i=0; i<rows.length; i++)    {
                if (rows[i].format === "空白" && rows[i].usingmode === "完整读出"
                        &&rows[i].epcBits>=hotWriteObj.reqEpcBits)     {
                    hotWriteObj.tagSerial = rows[i].tagserial;
                    validId = i;
                    break;
                }
            }
            if (validId>=0)     {
                $("#foundtagTab").datagrid('selectRow', validId);
                $("#barcodeStatus").val("可以写入=>");
                $("#usingTag").textbox('setValue', hotWriteObj.epc);
                hotWriteObj.poolId = validId;
                //写入动作B: 条码输入后，没有可用标签（且不在扫描中)，自动或手动开启找标签，找到空白标签即写入
                if (hotWriteObj.barcode.length>0 && hotWriteObj.epc.length >0)   {
                    writeTag();
                }
            }   else    {
                if (hotWriteObj.barcode.length>0)  {
                    $("#barcodeStatus").val("条码-标签不匹配");
                }
                else {
                    $("#barcodeInput").textbox('textbox').focus();
                    $("#barcodeStatus").val("扫描停止");
                }
            }
        }
        scanRuning = false;
    }   else {
        $("#barcodeStatus").val("扫描次数: "+count);
    }
}

var wrTagStatus = ["写EPC失败", "写失败：不能写入User区","写失败：未能写入密码","标签安全设定失败",
        "写入后校验错","标签写入成功"];
//执行标签写入
function writeTag()   {
    if (hotWriteObj.poolId <0 || hotWriteObj.epc.length<4)  {
        $("#barcodeStatus").val("条码-标签错误，不能写");
        return (false);
    }
    if ($("#foundtagTab").datagrid('getRows')[hotWriteObj.poolId].epcBits < hotWriteObj.reqEpcBits) {
        return(false);
    }

    $("#btnWriteTag").linkbutton('disable');
    $("#barcodeStatus").val("正在写入...");
/*
    devwrapper.writeTag(hotWriteObj.poolId, hotWriteObj.barcode, hotWriteObj.epc, 0, function(joRes)  {
        if (joRes.result>=0 && joRes.result<=5)   {
            $("#barcodeStatus").val(wrTagStatus[joRes.result]);
        }
        if (joRes.result ===5)   {
            updateWritedRecord(joRes, false);
            //条码输入界面刷新
            $("#usingTag").textbox('setValue', '['+hotWriteObj.barcode+']');
            $("#barcodeInput").textbox('setValue', "");     //效果不好，但必须
            $("#barcodeInput").textbox('textbox').focus();
            hotWriteObj.poolId = -1;
            hotWriteObj.epc = "";
            hotWriteObj.barcode = "";       //
        }
    });
*/
    doDevCommand("tagWrite",[hotWriteObj.poolId, hotWriteObj.barcode, hotWriteObj.epc, 0], function(joRes)   {
        if (joRes.data[0].result>=0 && joRes.data[0].result<=5) {
            $("#barcodeStatus").val(wrTagStatus[joRes.data[0].result]);
        }
        if (joRes.data[0].result ===5)   {
            updateWritedRecord(joRes.data[0], false);
            //条码输入界面刷新
            $("#usingTag").textbox('setValue', '['+hotWriteObj.barcode+']');
            $("#barcodeInput").textbox('setValue', "");     //效果不好，但必须
            $("#barcodeInput").textbox('textbox').focus();
            hotWriteObj.poolId = -1;
            hotWriteObj.epc = "";
            hotWriteObj.barcode = "";       //
        }
    });
    $("#btnWriteTag").linkbutton('enable');
    return(true);
}


function killTag()  {
    var id = $("#foundtagTab").datagrid('getRowIndex', $("#foundtagTab").datagrid('getSelected'));
    if (id<0)
        return;
    $.messager.confirm({title:'标签灭活',
        msg: '确定要将所选标签销毁？ <br>注意: 标签灭活是永久销毁，不能恢复',
        ok: '确认',
        cancel: '取消',
        fn: function(r){
        if (r)  {
            $("#barcodeStatus").val("标签灭活...");
            //条码输入界面刷新
            $("#usingTag").textbox('setValue', "");
            $("#barcodeInput").textbox('setValue', "");
            hotWriteObj.barcode = "";
            //执行kill
/*            devwrapper.killTag(id, function(joRes)  {
                if (joRes.result !== 0)   {
                    updateWritedRecord(joRes, true); */
            doDevCommand("tagKill",[id], function(joRes)   {
                if (joRes.result)   {
                    updateWritedRecord(joRes.data[0], true);
                    $("#barcodeStatus").val("标签已灭活");
                    //启动查找
                    runFindTag();   //start
                }
                else    {
                    $("#barcodeStatus").val("灭活失败");
                }

                $("#btnKillTag").linkbutton('disable');
            });
        }
    }});
}

//标签写入和灭活后的记录table显示
function updateWritedRecord(joRes, isKill)   {
    var rec = {
        evtype: "写入",
        wrtime:"",
        tagformat:""
    }
    var dt = new Date();
    rec.wrtime = formatTime(dt);
    if (isKill)
        rec.evtype = "灭活";

    rec.context = joRes.context;
    rec.epc = joRes.epc;
    rec.tagserial = joRes.tagSerial;
    if (!isKill)    {
        rec.wrUsrBank = joRes.writeUsrBank;
        rec.locked = joRes.setLocker;
    }

    var rowid = -1;
    if (isKill) {
        $("#killCount").textbox('setValue', joRes.killCount);
    }
    else if (joRes.wrCount > mWritedCount)    {
        mWritedCount = joRes.wrCount;     //
        $("#writedCount").textbox('setValue', mWritedCount);
    }
    else {
        rec.evtype = "改写";
        //列表中查找
        try {
            wrEventBuf.forEach(function(row, rid)   {
                if (row.tagserial === rec.tagserial)    {
                    rowid = rid;
                    throw new Error("EndInterative");
                }
            });
        }   catch(e)   {
            if (e.message !== "EndInterative")   throw e;
        }
    }
    //更新列表显示
    var pageNo = parseInt($("#wrEventTab").datagrid("options").pageNumber);
    var pagesize = parseInt($("#wrEventTab").datagrid("options").pageSize);
    if (rowid >=0)  {           //update
        for (var tmpfiled in wrEventBuf[rowid]) {
            if (rec[tmpfiled] !== undefined)
                wrEventBuf[rowid][tmpfiled] = rec[tmpfiled];    //这里还有点Bug:如果初始rows[]中没有的field，是不会加入的
        }
        if (rowid >=(pageNo-1)*pagesize && rowid<pageNo*pagesize)   {   //当前页内
            $("#wrEventTab").datagrid('refreshRow', (rowid % pagesize));
            $("#wrEventTab").datagrid('selectRow', (rowid % pagesize));      //光标
        }
    }   else {                  //append
        if (isKill)
            rec.count = joRes.killCount;
        else
            rec.count = joRes.wrCount;
        rowid = wrEventBuf.length;
        wrEventBuf.push(rec);
        if (pageNo*pagesize <= rowid)    {
            $("#wrEventTab").datagrid('loadData', wrEventBuf);
            $("#wrEventTab").datagrid('getPager').pagination('select', Math.floor(rowid/pagesize+1));
        }  else {
            $("#wrEventTab").datagrid('appendRow', rec);
        }
        $("#wrEventTab").datagrid('selectRow', (rowid % pagesize));     //光标。selectRow的行id是base-0的        
    }
}

