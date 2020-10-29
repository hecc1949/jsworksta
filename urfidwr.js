/**
  * UHF-RFID 图书标签制作
  *
  */
//全局变量
var mWritedCount = 0;
var hotWriteObj = {
    barcode: "",
    epc: "",
    poolId:-1,
    tagSerial:"",
    reqEpcBits:96,
    barcodeRepeat:false
};

window.channel = null;
window.devwrapper = null;       //这个先于qwebchannel初始化，界面初始化时qwebchannel未打开，有必要用这个判断

var isInventMode = false;
var barcodeNewline = false, scanRuning = false, inventRuning = false;

var wrEventBuf = [];
var m_InventRecBuf = [];

var locFileManage = {fileNames:"", extMediaPath:"", uploadUrl:""    };
//var extMediaPath = "";

//界面初始化。等效于放在$(document).ready((function()  {    }) 中
$(function initViews()  {
    //左边栏
    $("#functionMenu").accordion({ onSelect: functionsMain    });
    $("#genClock").textbox('textbox').css({fontSize: "2.0em", fontWeight:"bold",
                    color:"blue", textAlign:'center'});

    //条码输入框，设置不能用css配置的style
    $("#barcodeInput").textbox('textbox').css({fontSize: "1.8em", fontWeight:"bold",color:"blue"});
    $("#barcodeInput").textbox('textbox').bind('keydown', onBarcodeInput);      //event连接。jquery执行环境

    //条码-标签状态提示框。这是普通input，easyui的textbox不能去掉边框。基本style用css设置，readonly只能用jQuery设置
    $("#barcodeStatus").attr("readonly", true);
    $("#barcodeStatus").val("");
    $("#barcodeStatus").focus(function() {                  //调整成不能获得焦点的模式
        $("#barcodeInput").textbox('textbox').focus();
    });

    //当前选择&写的标签号。只读
    $("#usingTag").textbox('textbox').css("fontSize", "1.2em");
    $("#usingTag").textbox('textbox').css("backgroundColor", "rgb(225, 231, 206)");
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
    $("#writedCount").textbox('textbox').css({fontSize: "1.8em", fontWeight:"bold",color:"blue"});
    $("#writedCount").textbox('textbox').focus(function()  {
        $("#barcodeInput").textbox('textbox').focus();
    });
    $("#killCount").textbox('textbox').css({fontSize: "20pt", fontWeight:"bold",color:"black"});
    //写入事件记录表格
    $("#wrEventTab").datagrid({loadFilter: pagerFilter});
    $("#wrEventTab").datagrid('getPager').css({height:"40px"});

    //工具栏按钮
    $("#btnFindTag").bind('click', runFindTag);
    $("#btnWriteTag").linkbutton({
        disabled: true,
        //写入动作A: 按界面button手动写入
        onClick: writeTag
    });
    $("#btnKillTag").linkbutton({onClick: killTag, disabled: true});

    //--- 点验 ---
    //计数显示
    $("#inventTagCount, #inventFmtTagCount, #inventRunCount").each(function()   {
        $(this).textbox('textbox').css({fontSize: "1.8em", fontWeight:"bold",color:"blue"});
    });
    //点验表格
    $("#inventTab").datagrid({loadFilter: pagerFilter});
    $("#inventTab").datagrid('getPager').css({height:"40px"});
    //扫描速度选择框
    $("#inventSpeed").combo('textbox').css({fontSize: "1.2em"});
    $("#inventSpeed").combobox({
        onSelect:function(rec) {
            if (devwrapper !== null)    {
                devwrapper.setInventScanPeriod(rec.value);
            }
        }
    });

    //点验事件执行
    $("#btnInventRun").bind('click', runInvent);
    $("#btnInventMode").linkbutton({
        onClick: function() {
            if (devwrapper !== null)    {
                $("#btnInventMode").linkbutton("disable");
                devwrapper.toggleInventMode();
            }
        }
    });
    $("#btnInventNewGrp").linkbutton({
        onClick: function() {
            if (devwrapper !== null && !inventRuning)  {
                m_InventRecBuf.splice(0, m_InventRecBuf.length);        //清空
                $("#inventTab").datagrid('loadData', m_InventRecBuf);
                $("#inventTab").datagrid('getPager').pagination('select',1);    //清pageNumber
                devwrapper.inventResetLet(false);
//                devwrapper.inventResetLet(true);
            }
        }
    });

    // --- 数据管理 ---
    $("#wrEventDb").datagrid({loadFilter: pagerQueryDb});
    $("#inventDb").datagrid({loadFilter: pagerQueryDb});
    $('#dbTableSelect').tabs({
        onSelect: function(title, index) {
            var selAct = $("#dbExportMarkSel").switchbutton("options").checked;
            var filename = fileNameFromTime(index, !selAct);
            $("#exportTofile").textbox("setValue", filename);
        }
    });

    $("#dbExportMarkSel").switchbutton({
        onChange: function(checked){        //刷新显示
            var selAct = -1;
            if (checked)
                selAct = 0;
            dbViewInit(selAct, $("#wrEventDb"));
            dbViewInit(selAct, $("#inventDb"));
            //default export file name
            var tabSel = $('#dbTableSelect').tabs('getTabIndex', $('#dbTableSelect').tabs('getSelected'));
            var filename = fileNameFromTime(tabSel, (selAct===-1));
            $("#exportTofile").textbox("setValue", filename);
        }
    });
    //数据导出
    $("#exportTofile").textbox({
        onClickButton: function() {
            if (devwrapper !== null)    {
                var tabsel = 0;
                if ($('#dbTableSelect').tabs('getTabIndex', $('#dbTableSelect').tabs('getSelected')) ===0)  {
                    tabsel = 1;
                    if (!($("#dbExportMarkSel").switchbutton("options").checked))   {
                        tabsel = 2;
                    }
                }
                var filename = $("#exportTofile").textbox("getValue");
                devwrapper.exportDbRecords(tabsel, filename, function(jo)   {
                    if (jo.error === 0) {
                        $.messager.alert('导出数据成功', jo.message,'info');
                    }   else if (jo.error ===-1)    {
                        $.messager.alert('导出数据出错','文件名或选择条件错误.','error');
                        $("#exportTofile").textbox('textbox').focus();
                    }   else {
                        $.messager.alert('导出数据出错', jo.message,'error');
                    }
                });
            }
        }
    });
    $("#exportTofile").textbox('textbox').css("fontSize", "1.5em");     //要在event配置后面
    //文件操作
    $("#fileSelect").textbox({
        onClickButton: function() {
            if (devwrapper !== null)    {
                devwrapper.doSysFileOpenDialog("csv", "csv files(*.csv),text files(*.txt)", function(filenames)    {
                    if ($("#multiSelfile").checkbox('options').checked)   {
                        var fnames = $("#fileSelect").textbox('getValue');
                        if (fnames.length>0)  {
                            if (locFileManage.fileNames.indexOf(filenames) >=0) {
                                $.messager.alert('无效', '重复选择文件','warning');
                                return;
                            }
                            fnames += ", ";
                            locFileManage.fileNames += ",";
                        }
                        locFileManage.fileNames += filenames;
                        fnames += filenames.substr(filenames.lastIndexOf('/')+1);
                        $("#fileSelect").textbox('setValue', fnames);
                    }   else    {
                        $("#fileSelect").textbox('setValue', filenames);
                        locFileManage.fileNames = filenames;
                    }
                });
            }
        }
    });
    $("#fileSelect").textbox('textbox').css("fontSize", "1.2em");

    $("#fileCopy2Sd").linkbutton({
        onClick: function() {
            if (locFileManage.fileNames.length>0 && locFileManage.extMediaPath.length>0)    {
                devwrapper.doSysFileCommand("copy", locFileManage.fileNames, locFileManage.extMediaPath,
                    function(res)   {
                        if (res.error ===0)     {
                            $.messager.alert('文件', res.message, 'info');
                        }   else    {
                            $.messager.alert('文件处理错误', res.message, 'error');
                        }
                });
            }
        }
    });
    $("#fileDelete").linkbutton({
        onClick: function() {
            if (locFileManage.fileNames.length>0)    {
                devwrapper.doSysFileCommand("delete", locFileManage.fileNames, '',
                    function(res)   {
                        if (res.error ===0)     {
                            $.messager.alert('文件', res.message, 'info');
                            $("#fileSelect").textbox('setValue', '');
                            locFileManage.fileNames = '';
                        }   else    {
                            $.messager.alert('文件处理错误', res.message, 'error');
                        }
                });
            }
        }
    });


    //系统
    $("#configApply").linkbutton({
        onClick: function() {
            var rows = $("#configSettings").propertygrid('getChanges');
            devwrapper.setSysConfigs(rows, function(updCnt)    {
                if (updCnt>0)   {
                    $("#configApply").linkbutton("disable");
                    setTimeout(function() {
                        devwrapper.getSysConfigs(function(res) {
                            $('#configSettings').propertygrid('loadData', res);
                        });
                        $("#configApply").linkbutton("enable");
                    }, 3000);
                }
            });
        }
    });
    $("#btnClose").linkbutton({
        onClick: function() {
            $.messager.confirm({title:'退出系统', msg: '确定要退出程序？',
                fn: function(r){
                    if (r)  {
                        devwrapper.sysClose();
                    }
                }
            });
        }
    });

    //全部datagrid的分页布置
    $("#wrEventTab, #inventTab, #wrEventDb, #inventDb").each(function()    {
        $(this).datagrid('getPager').pagination({
            layout: ['sep','first','prev','links','next','last','sep','refresh','info']
        });
    });
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
        devwrapper.openURfidWritor(0, true, function(res) {
            if (!res)   {
                $("#barcodeInput").textbox('disable');
                $("#btnFindTag").linkbutton("disable");
            }
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
/*#        devwrapper.showSysToolbar(1000);
        $("#banner").hover(function()   {
            devwrapper.showSysToolbar(5000);
        });
*/
        //读写器event连接到处理函数
        devwrapper.findTagTick.connect(onfindTagTick);
        devwrapper.findTagUpdate.connect(onfindTagUpdate);

        devwrapper.inventScanChanged.connect(function() {
            var inventCount = devwrapper.inventScanCount;
            var inventTags = devwrapper.inventTagNumber;
            var inventFmtTags = devwrapper.inventFmtTagNumber;
            $("#inventRunCount").textbox('setValue', inventCount);
            $("#inventTagCount").textbox('setValue', inventTags);
            $("#inventFmtTagCount").textbox('setValue', inventFmtTags);
        });
        devwrapper.inventScanModeUpdate.connect(function(detailScan)    {
            if (detailScan)     {
                $("#btnInventMode").linkbutton({"text":"普通扫描"});
            }
            else    {
                $("#btnInventMode").linkbutton({"text":"精细扫描"});
            }
            $("#btnInventMode").linkbutton("enable");
        });
        devwrapper.inventTagUpdate.connect(onInventTagUpdate);

    });
});

var mnuContextPanel, mnuToolPanel;
//应用页切换
function functionsMain(title, index)    {
    if (!mnuContextPanel)   {
        mnuContextPanel = ["wrtagPanel", "inventPanel", "dbManagePanel", "configPanel"];
    }
    if (!mnuToolPanel)  {
        mnuToolPanel = ["wrtagTools", "inventTools","",""];
    }
    if (index<0 || index>3)
        return;
    $("#wrtagPanel, #inventPanel, #dbManagePanel, #configPanel").each(function()    {
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
    if (window.devwrapper !== null)  {
        //读写器模式切换
        if ((index===0 && isInventMode)||(index===1 && !isInventMode))  {
            var selInvent = (index===1);
            devwrapper.setInventifyMode(selInvent, function(result)    {
                if (!result)    {
                    $.messager.alert('设备故障','读写卡模块模式切换失败!','error');
                    if (selInvent)
                        $("#functionMenu").accordion('select', 0);
                    else
                        $("#functionMenu").accordion('select', 1);
                }   else    {
                    isInventMode = selInvent;
                    clearWrTagPanel();
                }
            });
        }
        //界面关联
        if (index===2)   {
            devwrapper.imeEnable(true);
            //数据库datagrid显示
            var selAct = -1;
            if ($("#dbExportMarkSel").switchbutton("options").checked)
                selAct = 0;
            dbViewInit(selAct, $("#wrEventDb"));
            dbViewInit(selAct, $("#inventDb"));

            //自动给出导出文件名
            var tabSel = $('#dbTableSelect').tabs('getTabIndex', $('#dbTableSelect').tabs('getSelected'));
            var filename = fileNameFromTime(tabSel, (selAct===-1));
            $("#exportTofile").textbox("setValue", filename);
            //检查可用的sdcard/udisk
            devwrapper.getExtMediaPath(function(fpath)  {
                locFileManage.extMediaPath = fpath;
                if (fpath.length ===0)  {
                    $("#fileCopy2Sd").linkbutton("disable");
                }   else    {
                    $("#fileCopy2Sd").linkbutton("enable");
                    if (fpath.indexOf("udisk")>=0)  {
                        $("#fileCopy2Sd").linkbutton({"text":"复制到U盘"});
                    }   else    {
                        $("#fileCopy2Sd").linkbutton({"text":"复制到SD卡"});
                    }
                }
            });
        }   else if (index===3)  {
            devwrapper.imeEnable(true);
//            $('#configSettings').propertygrid('loadData', cfgSettings);
            //读取配置
            devwrapper.getSysConfigs(function(res) {
                $('#configSettings').propertygrid('loadData', res);
            });
        }   else    {
            devwrapper.imeEnable(false);
        }
    }
}

//---------------------- 写标签功能 ---------------------------------------------
function clearWrTagPanel()  {
    $("#foundtagTab").datagrid('loadData', {total:0, rows:[]});     //清空列表
    $("#barcodeInput").textbox('setValue', "");
    $("#usingTag").textbox('setValue', '');
    $("#btnWriteTag").linkbutton('disable');
    $("#btnKillTag").linkbutton('disable');
    $("#barcodeInput").next('span').find('input').focus();
    hotWriteObj.barcode = "";
    hotWriteObj.poolId = -1;
}

//扫描枪输入
function onBarcodeInput(e)  {    
    var barcode = $(this).val();        //取当前值。用$("id").textbox('getValue')取的不可靠
    if (e.keyCode === 13){	// 当按下回车键时接受输入的值。
        barcodeNewline = true;
        devwrapper.checkBarcodeValid(barcode, function(restype) {
            var tagtype = Math.abs(restype);
            //返回值: 0-错误，1-要96bit标签，2-128bit标签，3-144bit以上标签。 负值为条码已写过，重复。
            if (tagtype >=1 && tagtype <=3) {
                if (restype>0)  {
                    $("#barcodeStatus").val("条码合法:");
                    hotWriteObj.barcodeRepeat = false;
                }
                else    {
                    $("#barcodeStatus").val("条码重复");
                    hotWriteObj.barcodeRepeat = true;
                }
                devwrapper.epcEncode(barcode, tagtype, function(epc)    {   //return在callback中
                    hotWriteObj.barcode = barcode;
                    hotWriteObj.epc = epc;
                    if (tagtype ===1)
                        hotWriteObj.reqEpcBits = 96;
                    else if (tagtype ===2)
                        hotWriteObj.reqEpcBits = 128;
                    else
                        hotWriteObj.reqEpcBits = 144;

                    if (scanRuning)     {
                        runFindTag();        //stop                        
                    }
                    else   {
                        if (hotWriteObj.poolId>=0 && restype>0)  {      //条码重复则不启动写，但重新找标签
                            $("#usingTag").textbox('setValue', epc);
                            //写入动作C： 条码输入时已经找到空白标签，不在扫描状态(手动开启的），启动写入
                            writeTag();
                        }
                        else
                            runFindTag();   //start
                    }
                });
            }
            else {
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
    if (!scanRuning)    {
        hotWriteObj.poolId = -1;        //不可快写
        $("#foundtagTab").datagrid('loadData', {total:0, rows:[]});     //清空列表
        $("#usingTag").textbox('setValue', '');
        $("#btnWriteTag").linkbutton('disable');
        $("#btnKillTag").linkbutton('disable');
        devwrapper.findTagsForWrite(true, function(res) {
            if (res)    {       //启动成功
                scanRuning = true;
                $("#btnFindTag").linkbutton({"text": "停止"});
            }
        });
    }
    else  {
        devwrapper.findTagsForWrite(false, function(res) {            
            if (res)    {       //停止成功
                scanRuning = false;
                $("#btnFindTag").linkbutton({"text": "查找标签"});
                $("#usingTag").textbox('setValue', '');
                $("#barcodeStatus").val("等待标签");
            }
        });
    }

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
                if (hotWriteObj.barcode.length>0 && hotWriteObj.barcodeRepeat)  {
                    $("#barcodeStatus").val("停止,条码重复");
                }
                else {
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
        return (false);
    }
    if ($("#foundtagTab").datagrid('getRows')[hotWriteObj.poolId].epcBits < hotWriteObj.reqEpcBits) {
        return(false);
    }

    $("#btnWriteTag").linkbutton('disable');
    $("#barcodeStatus").val("正在写入...");
    devwrapper.writeTag(hotWriteObj.poolId, hotWriteObj.barcode, hotWriteObj.epc, 0, function(joRes)  {
        if (joRes.result>=0 && joRes.result<=5)   {
            $("#barcodeStatus").val(wrTagStatus[joRes.result]);
        }
        if (joRes.result ===5)   {
            updateWritedRecord(joRes, false);
            //条码输入界面刷新
            $("#usingTag").textbox('setValue', '['+hotWriteObj.barcode+']');
            $("#barcodeInput").textbox('setValue', "");     //效果不好，但必须
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
            devwrapper.killTag(id, function(joRes)  {
                if (joRes.result !== 0)   {
                    updateWritedRecord(joRes, true);
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
                    throw new Error("Enderative");
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
//---------------------- 点验功能 ---------------------------------------------
function runInvent()    {
    var startRun = !inventRuning;
    devwrapper.runInvent(startRun, 0, function(res) {
        if (res)    {
            if (startRun)   {
                $("#btnInventRun").linkbutton({"text":"停止"});
                $("#btnInventMode").linkbutton("enable");
                $("#btnInventNewGrp").linkbutton("disable");
                $("#inventSpeed").combobox("disable");
            }
            else {
                $("#btnInventRun").linkbutton({"text":"点验"});
                $("#btnInventMode").linkbutton("disable");
                $("#btnInventNewGrp").linkbutton("enable");
                $("#inventSpeed").combobox("enable");
            }
            inventRuning = startRun;
        }
    });
}

var refreshHold = false;
function onInventTagUpdate(jo)  {
    var rec = {id: 0, epc: "", hitCount:0};
    rec.id = jo.id;
    rec.epc = jo.epc;
    rec.hitCount = jo.hitCount;
    rec.hitTime = jo.hitTime;

    var rowid = -1;
    if (jo["append"])  {
        rec.context = jo.context;
        rec.title = jo.title;
        rec.formatId = jo.formatId;
        if (jo.securityBit !== undefined)   {
            rec.securityBit = (jo.securityBit !==0);
        }
        rec.groupId = jo.groupId;
    }   else    {
        if (jo.id >0 && jo.id<=m_InventRecBuf.length)   //数组严格存储无错时，jo.id是数组index+1
            rowid = jo.id -1;
        else    {
            console.log("search for invent...");
            try {
                m_InventRecBuf.forEach(function(row, rid)   {
                    if (row.id === jo.id)   {
                        rowid = rid;
                        throw new Error("EndInterative");
                    }
                });
            }   catch(e)   {
                if (e.message !== "EndInterative")   throw e;
            }
        }
    }
    //提交显示
    var pageNo = parseInt($("#inventTab").datagrid("options").pageNumber);
    var pagesize = parseInt($("#inventTab").datagrid("options").pageSize);
    if (rowid >=0)   {      //update模式
        for (var tmpfiled in m_InventRecBuf[rowid]) {
            if (rec[tmpfiled] !== undefined)
                m_InventRecBuf[rowid][tmpfiled] = rec[tmpfiled];
        }
        //在当前页，刷新显示
        if (rowid >=(pageNo-1)*pagesize && rowid<pageNo*pagesize)   {            
            if (!refreshHold)   {
                $("#inventTab").datagrid('loadData', m_InventRecBuf);   //多行刷新
                refreshHold = true;         //必须限制屏幕刷新率，否则频繁刷新会使整体反应迟钝
                setTimeout(function() {
                    refreshHold = false;
                }, 1000);
            }
        }
    }   else    {           //append模式
        rowid = m_InventRecBuf.length;
        m_InventRecBuf.push(rec);
        if (pageNo*pagesize <= rowid)    {      //换页
            $("#inventTab").datagrid('loadData', m_InventRecBuf);
            $("#inventTab").datagrid('getPager').pagination('select', Math.floor(rowid/pagesize+1));
        }  else {
            $("#inventTab").datagrid('appendRow', rec);
        }
        $("#inventTab").datagrid('selectRow', (rowid % pagesize));     //光标
    }
}

