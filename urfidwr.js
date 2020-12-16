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

var isInventMode = true;
var barcodeNewline = false, scanRuning = false, inventRuning = false;

var wrEventBuf = [];

var m_InventRecBuf = [];            //点验，接收-显示缓存
var m_inventGrps = [];              //已上架标签缓存，只保留条码。动态变长，发送后清除
var m_hotInventGrpId = 0;           //当前分组（书架）索引
var inventCounter = {
    foundTags: 0,               //接收到的总数
    contextValidTags: 0,        //识别出格式(formatId>=0)的标签数
    groupedTags: 0,             //已进行上架分组的标签总数, 仅有效标签
    groupValidTags: 0,          //已进行上架分组的标签总数，包括空白标签，因此比m_inventGroupValidTags可能要多
    frameTags: 0,               //发现的书架标签数
    crossGrpCount: 0            //误读已分组上架标签次数
}

var m_locfile_mediaPath = "";
var m_setting;

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
    $("#inventTagCount, #inventRunCount").each(function()   {
        $(this).textbox('textbox').css({fontSize: "1.8em", fontWeight:"bold",color:"blue"});
    });
    $("#inventUnFmtTagCount, #inventGroupedCount,#inventCrosGrpCount").each(function()   {
        $(this).textbox('textbox').css({fontSize: "1.5em", fontWeight:"bold",color:"black"});
    });

    //点验表格
    $("#inventTab").datagrid({
        loadFilter: pagerFilter,
        onSelect:function() {       //附加工作，锁住分组表格的下select光标
            $("#grptags").datalist('selectRow', m_hotInventGrpId);
        }
    });
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

    //点验执行
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
                inventNewGroup(false);
//                tstSendJson();
            }
        }
    });
    $("#btnInventFinish").linkbutton({
        disabled: true,
        onClick: doInventFinish
    });


    // --- 数据管理 ---
    $("#inventDb").datagrid({loadFilter: pagerQueryDb});
    $("#wrEventDb").datagrid({loadFilter: pagerQueryDb});
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
                //table选择：0-invents未导出， 1-invents全部  2-wrtag未导出， 3-wrtag全部
                var tabsel =2*$('#dbTableSelect').tabs('getTabIndex', $('#dbTableSelect').tabs('getSelected'));
                if (!($("#dbExportMarkSel").switchbutton("options").checked))   {
                    tabsel +=1;
                }
                var filename = $("#exportTofile").textbox("getValue");
                devwrapper.exportDbRecords(tabsel, filename, function(jo)   {
                    if (jo.error === 0) {
                        $.messager.alert('导出数据成功', jo.message,'info');
                        if (tabsel <2)
                            clearInventPanel();
                        else
                            clearWrTagPanel();
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
    $("#exportTofile").textbox('textbox').focus(function()  {
        devwrapper.imeEnable(true);
    });
    $("#exportTofile").textbox('textbox').blur(function()  {
        devwrapper.imeEnable(false);
    })
    $("#exportTofile").textbox('textbox').css("fontSize", "1.5em");     //要在event配置后面

    //文件操作
    $("#fileCopy2Sd").linkbutton({
        onClick: function() {locFileOperate("copy");   }
    });
    $("#fileDelete").linkbutton({
        onClick: function() {locFileOperate("delete");   }
    });
    $("#uploadfiles").filebox({ onChange: uploadDatfiles });
    $("#uploadfiles").filebox('textbox').css("fontSize", "1.2em");;

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
            if (m_InventRecBuf.length>0 || m_inventGrps.length>0)   {
                $.messager.confirm({width:600, height: 180, title:'退出系统',
                    msg: '警告：点验数据没有完整上报，退出程序将丢失 <br/>应该上报数据或转成txt文件保存再退出.',
                    fn: function(r){
                        if (!r)  {
                            devwrapper.sysClose();
                        }
                    }
                });
            }   else    {
                $.messager.confirm({title:'退出系统', msg: '确定要退出程序？',
                    fn: function(r){
                        if (r)  {
                            devwrapper.sysClose();
                        }
                    }
                });
            }
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
        devwrapper.openURfidWritor(1, true, function(res) {     //0-写标签模式，1-点验模式
            if (!res)   {
                $("#barcodeInput").textbox('disable');
                $("#btnFindTag").linkbutton("disable");
                $("#btnInventRun").linkbutton("disable");
            }
            inventCounter.foundTags = devwrapper.inventTagNumber;
            $("#inventTagCount").textbox('setValue', inventCounter.foundTags);

            devwrapper.getInventScanPeriod(function(val)  {
                $("#inventSpeed").combobox('select', val);
            });
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
        //读写器event连接到处理函数
        //写标签功能
        devwrapper.findTagTick.connect(onfindTagTick);
        devwrapper.findTagUpdate.connect(onfindTagUpdate);
        //点验功能
        devwrapper.inventScanChanged.connect(function() {
            $("#inventRunCount").textbox('setValue', devwrapper.inventScanCount);
            inventCounter.foundTags = devwrapper.inventTagNumber;
            inventCounter.contextValidTags = devwrapper.inventFmtTagNumber;
            $("#inventTagCount").textbox('setValue', inventCounter.foundTags);
            var cnt1 = inventCounter.foundTags - inventCounter.contextValidTags + inventCounter.frameTags;
            $("#inventUnFmtTagCount").textbox('setValue', cnt1);

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

        //一般配置，读出
        devwrapper.getSysConfigs(function(res) {
            $('#configSettings').propertygrid('loadData', res);
        });
        //IP输入框
        devwrapper.loadJsonTextFile("setting.json", function(res){
            jo = JSON.parse(res);
            if (jo !== null)    {
                m_setting = jo;
                if (jo.serverIp !== undefined)  {
                    $("#serverIp").val(jo.serverIp);
                }
            }   else    {
                m_setting = {"serverIp":"127.0.0.1" };
            }
        });
        $("#serverIp").bind('blur', function()  {
            if ($(this).validatebox('isValid'))  {
                if (m_setting.serverIp===undefined || $(this).val() !== m_setting.serverIp)   {
                    m_setting.serverIp = $(this).val();
                    devwrapper.saveJsonTextFile(JSON.stringify(m_setting),"setting.json");
                }
            }
        })
    });
});

var mnuContextPanel, mnuToolPanel;
//应用页切换
function functionsMain(title, index)    {
    if (!mnuContextPanel)   {
        mnuContextPanel = ["inventPanel", "wrtagPanel", "dbManagePanel", "configPanel"];
    }
    if (!mnuToolPanel)  {
        mnuToolPanel = ["inventTools","wrtagTools", "",""];
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
                m_locfile_mediaPath = fpath;
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
        }   else    {
            devwrapper.imeEnable(false);
        }
    }
}

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

function clearInventPanel() {
    m_InventRecBuf.splice(0, m_InventRecBuf.length);
    m_inventGrps.splice(0, m_inventGrps.length);
    m_hotInventGrpId = 0;
    for(var key in inventCounter)   {
        inventCounter[key] = 0;
    }

    $("#inventTab").datagrid('loadData', {total:0, rows:[]});     //清空列表
    $("#inventTab").datagrid('getPager').pagination('select',1);    //清pageNumber
    $("#inventTagCount").textbox('setValue', "");
    $("#inventUnFmtTagCount").textbox('setValue', "");
    $("#inventCrosGrpCount").textbox('setValue', "");
    $("#inventGroupedCount").textbox('setValue', "");
    $("#inventRunCount").textbox('setValue', "");

    $("#grptags").datalist('loadData', {total:0, rows:[]});
}

//---------------------- 写标签功能 ---------------------------------------------
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
                    }   else   {
                        if (hotWriteObj.poolId>=0 && restype>0)  {      //条码重复则不启动写，但重新找标签
                            $("#usingTag").textbox('setValue', epc);
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
    }    else  {
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
                if (hotWriteObj.barcode.length>0)  {
                    $("#barcodeStatus").val("条码-标签不匹配");
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
        $("#barcodeStatus").val("条码-标签错误，不能写");
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
//---------------------- 点验功能 ---------------------------------------------
var inventPrepare = false;
function runInvent()    {
    if (devwrapper === null)
        return;
    if (!inventPrepare)  {
        if ($("#grptags").datalist('getRows').length ===0)  {
            inventNewGroup(false);       //首次执行，自动开一个新分组
        }
        if (inventCounter.foundTags>0 && inventCounter.groupedTags===0 && m_InventRecBuf.length===0)    {
            $.messager.confirm('记录数据清空', '有未导出的上次点验数据，是否清空重新开始?', function(r){
                 if (r){
                     devwrapper.inventResetLet(true);
                 }
             });
            inventPrepare = true;
            return;
        }
        inventPrepare = true;
    }

    var scanmode = 0;   //0-自动切换普通/精细模式，也可手动； 1-普通模式，可手动切换； 2-精细模式，可手动切换
    if ($("#inventSpeed").combobox('getValue') < 200)   {
        scanmode = 2;
    }
    var startRun = !inventRuning;
    devwrapper.runInvent(startRun, scanmode, function(res) {
        if (res)    {
            if (startRun)   {
                $("#btnInventRun").linkbutton({"text":"停止"});
                $("#btnInventMode").linkbutton("enable");
                $("#btnInventNewGrp").linkbutton("disable");
                $("#inventSpeed").combobox("disable");
                $("#btnInventFinish").linkbutton("disable");
            }
            else {
                $("#btnInventRun").linkbutton({"text":"点验"});
                $("#btnInventMode").linkbutton("disable");
                $("#btnInventNewGrp").linkbutton("enable");
                $("#inventSpeed").combobox("enable");
                $("#btnInventFinish").linkbutton("enable");
            }
            inventRuning = startRun;
        }
    });
}

var refreshHold = false;
function onInventTagUpdate(jo)  {
    var rec = {id: 0, epc: "", hitCount:0};
    rec.epc = jo.epc;
    rec.hitCount = jo.hitCount;
    rec.hitTime = jo.hitTime;

    //按格式/分组，做预处理
    if (filterForFrameTags(jo)) {       //书架分组标签
        if (jo["append"] && jo.context.length>0)   {
            grprows = $("#grptags").datalist('getRows');
            if (m_hotInventGrpId< grprows.length && grprows[m_hotInventGrpId].text[0] === '-')  {
                $("#grptags").datalist('updateRow',{index: m_hotInventGrpId,
                    row:{text: jo.context, value: m_hotInventGrpId+1    }});
            }   else    {
                $("#grptags").datalist('appendRow',{text: jo.context, value: grprows.length});    //加到分组表
            }
            inventCounter.frameTags++;
        }
        return;
    }   else    {           //普通标签
        if (jo.formatId ===0)
            rec.formatId = "标准";
        else if (jo.formatId < 0)
            rec.formatId = "空白";
        else
            rec.formatId = "兼容格式"+ jo.formatId;
    }

    if (jo.groupId !== m_hotInventGrpId)    {           //其他分组
        inventCounter.crossGrpCount++;
        $("#inventCrosGrpCount").textbox('setValue', inventCounter.crossGrpCount);
        return;
    }
    rec.groupNo = jo.groupId +1;
    //
    rec.id = jo.id;     //jo.id保存的是包含全部分组的缓存数组index+1
    var rowid = -1;
    if (jo["append"])  {        //初次发现
        if (jo.formatId>=0)
            rec.context = jo.context;       //条码
        else
            rec.context = "";
        rec.title = jo.title;
        if (jo.securityBit !== undefined)   {
            rec.securityBit = (jo.securityBit !==0);
        }
    }   else    {               //重复发现
        //在有推入分组m_inventGrps[]和分离书架标签的情况下，jo.id与m_InventRecBuf[]缓存数组索引的关系被打乱，只能硬搜索
        try {
            m_InventRecBuf.forEach(function(row, rid)   {
                if (row.id === jo.id)   {
//                if (row.id === jo.id && row.epc ===jo.epc)   {
                    rowid = rid;
                    throw new Error("EndInterative");   //break forEach
                }
            });
        }   catch(e)   {
            if (e.message !== "EndInterative")   throw e;
        }
        if (rowid <0)   {
            return;
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

function inventNewGroup(saveHotOnly)   {
    if (inventRuning)
        return;
    var grprows = $("#grptags").datalist('getRows');
    //已找到的标签，提取出各内容（条码)项到m_inventGrps，清空显示表
    if (m_InventRecBuf.length >0)   {
        var grp = {"groupNo":m_hotInventGrpId+1, "grptag": "",
            "count" : m_InventRecBuf.length,
            "contexts" :[]};
        if (grprows && grprows.length>m_hotInventGrpId) {
            grp.grptag = grprows[m_hotInventGrpId].text;
        }
        m_InventRecBuf.forEach(function(row, rid)   {
            if (row.context !==undefined && row.context.length>0)   {
                grp.contexts.push(row.context);     //空白标签不加入
                inventCounter.groupValidTags++;
            }
            inventCounter.groupedTags++;
        });
        m_inventGrps.push(grp);

        m_InventRecBuf.splice(0, m_InventRecBuf.length);        //清空
        $("#inventTab").datagrid('loadData', m_InventRecBuf);
        $("#inventTab").datagrid('getPager').pagination('select',1);    //清pageNumber
        $("#inventGroupedCount").textbox('setValue', inventCounter.groupValidTags);

        var usedGrpTag = grprows[m_hotInventGrpId].text + "[已完成]";
        $("#grptags").datalist('updateRow',{index: m_hotInventGrpId,
            row:{text: usedGrpTag, value: m_hotInventGrpId+1    }});
        m_hotInventGrpId++;     //开启新分组
    }
    if (saveHotOnly)
        return;
    //开启新分组：分组（书架标签）表增加行并选择
    if (grprows.length <=m_hotInventGrpId)   {
        $("#grptags").datalist('appendRow',{text:'-未指定标签', value: (m_hotInventGrpId+1)});
    }
    $("#grptags").datalist('selectRow', m_hotInventGrpId);    
    //与dev端同步
    devwrapper.inventSetGroupId(m_hotInventGrpId);
    m_inventCrossGrpCount = 0;
    $("#inventCrosGrpCount").textbox('setValue', 0);

    //ajax发送已完成的分组
    if (m_inventGrps.length >0 && m_setting.serverIp.length>0)     {
        sendHotInventReport();
    }
}


function sendHotInventReport(callback)  {
    var sendjo = m_inventGrps[0];
    sendjo.usrname = getOperatorName();
    var size = sendjo.contexts.length;
    $.ajax({
        url: "http://" + m_setting.serverIp + ":2280/worksta/inventReport",
        type:"POST",
        timeout: 1000,
        crossDomain: true,
        dataType: 'json',
        contentType: 'application/json; charset=utf-8',
        data: JSON.stringify(sendjo),
        processData:false,
        success: function(res, textStatus, jQxhr ){
            m_inventGrps.splice(0, 1);            
            $("#inventMsgLabel").html("第-" +sendjo.groupNo + "组" + size+ " 条分组数据上传成功. >> "+ res.data);
            if (m_inventGrps.length>0)  {
                setTimeout(sendHotInventReport, 100);
            }   else    {
                if (callback)
                    callback(true);
            }
        },
        error: function(err, textStatus, errorThrown ){
            $("#inventMsgLabel").html("第-" +sendjo.groupNo + "组数据联网上报时出错");
            $.messager.show({title:'点验分组数据上报',	msg:'数据上报失败:<br/> 没有联网，或者接收服务没有开启',
                    timeout:5000, showType:'slide'});
            if (callback)
                callback(false);
        }
    });
}

//书架标签格式定义
function filterForFrameTags(joTag)  {
    if (joTag.formatId===undefined || joTag.context===undefined)
        return(false);
    if (joTag.formatId <0 || joTag.context.length<4)
        return(false);
    var fix = false;
    for(var i=0; i<joTag.context.length; i++)   {
        if ((joTag.context[i]>='A' && joTag.context[i]<='Z')||(joTag.context[i]>='a' && joTag.context[i]<='z')) {
            fix = true;
            break;
        }
    }
    return(fix);
}

//分组上架数据导出为txt文件
function inventBuildTxtReport()   {
    if (inventRuning || m_inventGrps.length===0)
        return;
     var buf = [];           //text行缓存
    m_inventGrps.forEach(function(grp, id)   {
        var title = "#" + grp.groupNo +" - " +grp.grptag + ",("+ grp.count+")";
        buf.push(title);
        grp.contexts.forEach(function(item, id) {
            buf.push(item);
        });
    });

    var dt = new Date();
    var month = dt.getMonth()+1;
    var filename = "csv/D"+ dt.getFullYear() + month + dt.getDate() +
            "T"+ dt.getHours()+ dt.getMinutes()+ "-"+getOperatorName()+".txt";
    devwrapper.saveJsonTextFile(JSON.stringify(buf), filename, function(res)    {
        if (res)    {
            $.messager.alert('导出数据', "未联网上报的数据保存在：<br/>" + filename,'info');
            m_inventGrps.splice(0, m_inventGrps.length);
            clearInventPanel()
            devwrapper.inventResetLet(true);        //不再用导出csv来清exportmark
        }   else    {
            $.messager.alert('导出文件失败', "未联网上报的数据保存文件出错",'error');
        }
    });
}

function doInventFinish()   {
    if (inventRuning)   return(false);
    if (m_InventRecBuf.length===0 && m_inventGrps.length===0)   {
        if (inventCounter.foundTags >0) {
            $.messager.confirm('结束点验', '数据已联网上报，清除记录不再导出?', function(r){
                if (r)  {
                    devwrapper.inventResetLet(true);        //不再用导出csv来清exportmark
                }
            });
        }
        return(true);
    }

    inventNewGroup(true);           //未转换到m_inventGrps[]的，做转换    
    var cnt = m_inventGrps.length;
    if (cnt > 0)  {
        sendHotInventReport(function(res)   {
            if (!res)   {
                $.messager.confirm('结束点验', '数据未能联网上报，保存到TXT文件?', function(r){
                    if (r)
                        inventBuildTxtReport();
                    else
                        return(false);
                });
            }   else    {
                clearInventPanel();
                $.messager.confirm('结束点验', '数据已联网上报，清除记录不再导出?', function(r){
                    if (r)
                        devwrapper.inventResetLet(true);        //不再用导出csv来清exportmark
                })
            }
        });
    }
    return(true);
}
