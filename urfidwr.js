/**
  * UHF-RFID 图书标签制作
  *
  */
//全局变量
var hotWriteObj = {
    barcode: "",
    epc: "",        //读出标签的epc
    poolId:-1,
    tagSerial:"",
    reqEpcBits:96,
    validEpcBits:0
//    barcodeRepeat:false
};

var wrEventsCursor = 0;
var scanRuning = false;

//界面初始化
//$(function initViews()  {
function initWrtagViews()  {
    //条码输入框
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
    $("#foundtagTab").datagrid({ onSelect: onFoundTagSelect });

    //写标签计数, 灭活计数
    $("#writedCount").textbox('textbox').focus(function()  {
        $("#barcodeInput").textbox('textbox').focus();
    });
    //事件表格
    $("#wrEventTab").datagrid({
        onLoadSuccess: function()   {       //设置select光标要在onLoadSuccess，load/reload会冲掉selectRow动作
            var pagesize = $(this).datagrid("options").pageSize;
            var cursor = wrEventsCursor % pagesize;
            if (cursor>=0)
                $(this).datagrid("selectRow", cursor);
        }
    });
    $("#wrEventTab").datagrid('getPager').css({height:"30px"});
    $("#wrEventTab").datagrid('getPager').pagination({
        layout: ['sep','first','prev','links','next','last','sep','refresh','info']
    });

    //工具栏按钮
    $("#btnFindTag").bind('click', runFindTag);
    $("#btnWriteTag").linkbutton({
        disabled: true,
        //写入动作A: 按界面button手动写入
        onClick: writeTag
    });
    $("#selWrtagFast").switchbutton({
        onChange: function(checked) {
            $("#barcodeInput").textbox('textbox').focus();
        }
    });
    $("#wrtagToolsGrp").accordion({
        onSelect: function(title, index)    {
            $('#mainwin').layout('collapse', 'west');   //关闭左侧菜单栏
/*            if ($("#wrEventTab").datagrid("getRows").length >0)
                $("#btnWrDatExportDownld").linkbutton("enable")
            else
                $("#btnWrDatExportDownld").linkbutton("disable")    */
        }
    });

    $("#btnKillTag").linkbutton({onClick: killTag, disabled: true});
    $("#btnWrSecurityBit").linkbutton({
        disabled: true,
        onClick: function() {
            writeDefinedItemWord(111);
        }
    });
    $("#btnEpcSizeRebuild").linkbutton({
        disabled: true,
        onClick: function() {
            writeDefinedItemWord(-1);
        }
    });

    //导出数据
    $("#btnWrDatExportDownld").linkbutton({
        onClick: function() {
            if (!scanRuning) {
                doWithPasswd("结束点验，下载数据", function(passwd)  {
                    var para = [2, ""];
                    var jo = {"command":"miscExportDbRecords", "param":JSON.stringify(para),
                                "clientId":_clientId, "password":passwd   };
                    sendAjaxCommand("commands", jo, function(dat)   {
                      if (dat.result===true && dat.filename.length>0)    {
                            filedownload(dat.filename);
                            $("#statusBar").text("导出数据文件："+ filebasename(dat.filename)+"  保存在你的浏览器<下载>文件夹中");
                        }
                        else    {
//                            $.messager.alert('错误','命令执行失败! 权限或密码错误','error');
                            $.messager.alert('错误','命令执行失败: 没有可用数据','error');
                        }
                    });
                });
            }
        }
    });
}
//});

function clearWrTagPanel()  {
    $("#foundtagTab").datagrid('loadData', {total:0, rows:[]});     //清空列表
    $("#wrEventTab").datagrid('load');

    $("#barcodeInput").textbox('setValue', "");
    $("#barcodeStatus").val("");
    $("#usingTag").textbox('setValue', '');
    $("#btnWriteTag").linkbutton('disable');
    $("#btnKillTag").linkbutton('disable');    
    $("#btnWrSecurityBit").linkbutton('disable');
    $("#barcodeInput").next('span').find('input').focus();

    hotWriteObj.barcode = "";
    hotWriteObj.poolId = -1;        
}

//---------------------- 写标签功能 ---------------------------------------------
var defEpcSizes = [{"size": 0, "barcodeInfo":"条码错误"},
    {"size":96, "barcodeInfo":"条码合规格"},
    {"size":128, "barcodeInfo":"条码合规格"},
    {"size":144, "barcodeInfo":"条码要求144位以上标签"}];
var barcodeNewline = false;
//扫描枪输入
function onBarcodeInput(e)  {    
    if (_clientId !==1)
        return;
    var barcode = $(this).val();        //取当前值。用$("id").textbox('getValue')取的不可靠
    if (e.keyCode === 13){	// 当按下回车键时接受输入的值。
        barcodeNewline = true;
        doDevCommand("tagBarcodeToEpc",[barcode, 1], function(joRes)   {
            var fmtId = joRes.data[0].reqTagType;
            var tagtype = Math.abs(fmtId);
            if (tagtype >3)
                tagtype = 0;
            var s1 = defEpcSizes[tagtype].barcodeInfo;
            if (fmtId <0)
                s1 = "条码重复";
            $("#barcodeStatus").val(s1);
            hotWriteObj.reqEpcBits = defEpcSizes[tagtype].size;
            if (fmtId >0 && fmtId<=3)    {      //条码正确，且不重复
                hotWriteObj.barcode = barcode;
                if (scanRuning)     {
                    runFindTag();        //stop停止扫描，在停止后的callback中进一步判断是否启动写入
                }
                else   {
                    var validId = getValidTag();
                    if (validId >=0 && hotWriteObj.epc !== joRes.data[0].epc)   {   //有可用标签
                        $("#usingTag").textbox('setValue', joRes.data[0].epc);
                        //xx写入动作C： 条码输入时已经找到可用标签，不在扫描状态(手动开启的），启动写入
                        //模式A：先找到了可用标签，输入条码启动写。扫描已经停止
                        hotWriteObj.poolId = validId;
                        writeTag();
                    }
                    else    {
                        runFindTag();   //start
                    }
                }
            }
            else    {
                $("#barcodeInput").textbox('textbox').focus();
            }
        });
    }
    else    {
        //普通字符输入。第一字符开启新输入模式，扫描单个条码
        if (barcodeNewline) {
            barcodeNewline = false;
            $("#barcodeInput").textbox('setValue', "");
            $("#barcodeStatus").val("");
            $("#usingTag").textbox('setValue', "");
            hotWriteObj.barcode = "";       //不可用标记
            hotWriteObj.reqEpcBits = 96;
        }
    }           
}

//event响应：
function onTagwrDevMsg(jo)  {
    if (jo.writedCount !== undefined)  {
        $("#writedCount").textbox('setValue', jo.writedCount);
    }
    if (jo.killCount !== undefined)  {
        $("#killCount").textbox('setValue', jo.killCount);
    }
    if (jo.writedCount !== undefined || jo.killCount !== undefined) {
        setGridviewCursor($("#wrEventTab"), -1);
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

//启动&停止查找待写标签
function runFindTag() {
    if (_clientId !==1)
        return;
    if (!scanRuning)    {   //start
        $('#mainwin').layout('collapse', 'west');   //关闭左侧菜单栏        
        hotWriteObj.poolId = -1;        //不可写
        hotWriteObj.epc = "";
        hotWriteObj.validEpcBits = 0;
        $("#foundtagTab").datagrid('loadData', {total:0, rows:[]});     //清空列表

        $("#usingTag").textbox('setValue', '');
        $("#btnWriteTag").linkbutton('disable');
        $("#btnKillTag").linkbutton('disable');
        $("#selWrtagFast").switchbutton('disable');
        doDevCommand("tagFindValid",[true], function(joRes)   {
            if (joRes.result)    {       //启动成功
                scanRuning = true;
                $("#btnFindTag").linkbutton({"text": "停止"});
            }
        });
        $("#statusBar").text(' ');      //清prompt信息显示
    }
    else  {        //stop
        doDevCommand("tagFindValid",[false], function(joRes)   {
            if (joRes.result)    {       //停止成功
                scanRuning = false;
                afterStopScan();
            }   //正常也会出现一些stop失败的情况，因为模块的停止扫描受一些实际时序约束
        });
    }
    $("#barcodeInput").textbox('textbox').focus();  //光标，等条码输入
}

//功能子函数：标签可写条件定义
function getValidTag()  {
    if (hotWriteObj.poolId>=0)
        return(hotWriteObj.poolId);

    var validId = -1;
    var rows = $("#foundtagTab").datagrid('getRows');
    for(var i=0; i<rows.length; i++)    {
        if (rows[i].usingmode === "完整读出" && rows[i].format === "空白" && rows[i].epc.length>4
                && rows[i].epcBits>=hotWriteObj.reqEpcBits && rows[i].epc !== prev_writed_Epc)   {
            hotWriteObj.tagSerial = rows[i].tagserial;
            hotWriteObj.epc = rows[i].epc;
            hotWriteObj.validEpcBits = rows[i].epcBits;
            validId = i;
            break;
        }
    }
    if (validId <0 && $("#selWrtagFast").switchbutton("options").checked===true
            && rows.length===1 && rows[0].usingmode === "完整读出" && rows[0].epc.length>4
            && rows[0].epcBits>=hotWriteObj.reqEpcBits && rows[0].epc !== prev_writed_Epc)    {
        hotWriteObj.tagSerial = rows[0].tagserial;
        hotWriteObj.epc = rows[0].epc;
        hotWriteObj.validEpcBits = rows[0].epcBits;
        validId = 0;

    }
    return(validId);
}

//功能子函数：
function afterStopScan()    {
    var validId = getValidTag();
    if (validId>=0)     {
        $("#foundtagTab").datagrid('selectRow', validId);
        $("#barcodeStatus").val("可以写入=>");
        $("#usingTag").textbox('setValue', hotWriteObj.epc);
        //x写入动作B: 条码输入后，没有可用标签（且不在扫描中)，自动或手动开启找标签，找到空白标签即写入
        //模式B：先有条码后找到可用标签，停扫描启动写入。条码输入时正在扫描，发现有可用标签命令停止扫描；或扫描机制自动停止了扫描
        if (hotWriteObj.barcode.length>0 && hotWriteObj.validEpcBits>=hotWriteObj.reqEpcBits)   {   //有条码
            hotWriteObj.poolId = validId;       //
            writeTag();
        }
        else    {
            $("#usingTag").textbox('setValue', '');
            $("#barcodeStatus").val("等待输入条码");
        }
    }
    else    {
        if (hotWriteObj.barcode.length>0)  {
            if ($("#foundtagTab").datagrid('getRows').length ===1 &&
                    $("#foundtagTab").datagrid('getRows')[0].epc === prev_writed_Epc)   {
                $("#barcodeStatus").val("已写标签请拿开");
            }
            else if ($("#foundtagTab").datagrid('getRows').length >0)
                $("#barcodeStatus").val("没有空白标签, 请手工选择");
            else
                $("#barcodeStatus").val("没有找到空白标签");
        }
        else {
            $("#barcodeStatus").val("扫描停止");
        }
    }
    $("#btnFindTag").linkbutton({"text": "查找标签"});
    $("#selWrtagFast").switchbutton('enable');
    if ($("#foundtagTab").datagrid('getRows').length>0 && _clientId===1) {
        $("#btnWriteTag").linkbutton('enable');
        $("#btnKillTag").linkbutton('enable');
    }

    $("#barcodeInput").textbox('textbox').focus();  //光标，等条码输入
}

//event响应：读写器扫描待写标签发出的event
function onfindTagTick(count)    {
    if (count<0)    {       //底层模块达到了(最大)停止条件而自动停止了扫描
        if (scanRuning) {
            scanRuning = false;     //这个停止是底层自动产生的，与前端控制异步，因此有可能处于scanRuning状态
        }
        afterStopScan();
    }
    else {
        $("#barcodeStatus").val("扫描次数: "+count);
        $("#barcodeInput").textbox('textbox').focus();  //光标，等条码输入
    }
}

var prev_writed_Epc = "";
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
    rec.context = jo.barcode;
    rec.tagserial = jo.serialNo;
    if (jo.accessPwd !== undefined && jo.killPwd !== undefined) {
        rec.passwd = jo.accessPwd + "/" + jo.killPwd;
    }
    //提交显示
    if (rowid >= $("#foundtagTab").datagrid('getRows').length)  {
        $("#foundtagTab").datagrid('appendRow', rec);
    }
    else {
        $("#foundtagTab").datagrid('updateRow', {index: rowid, row: rec });        
    }

    //---- "写安全位"相关view的随动 [*应该建一个rows缓存池，在手工选择标签时再随动的！]
    if (jo["fmtId"] !== undefined)  {
        if (jo["fmtId"] ===0)    {
            if (jo.securityBit !== undefined)   {
                if (jo.securityBit ===0)
                    $("#securityBitNew").combobox('select', 1);
                else
                    $("#securityBitNew").combobox('select', 0);
            }
        }
    }

    //---- 快速模式，发现可用标签即停扫描
    if ($("#selWrtagFast").switchbutton("options").checked && hotWriteObj.barcode.length>0) {
        if (getValidTag() >=0)  {
            if (scanRuning)     {
                console.log("fastmode, scan stop");
                runFindTag();   //stop. 这里有很大的几率会停止失败！
            }
        }
    }
}

//手工选择标签
function onFoundTagSelect(index, row)  {
    if (_clientId !==1)
        return;
    if (!scanRuning)    {
        if (hotWriteObj.barcode.length>0)   {
            $("#barcodeStatus").val("选择标签");
            if (row.usingmode === "完整读出" && row.epcBits >=hotWriteObj.reqEpcBits)  {
                hotWriteObj.poolId = index;
                hotWriteObj.tagSerial = row.tagSerial;
                $("#barcodeStatus").val("选择标签: ");
                $("#usingTag").textbox('setValue', row.epc);
                $("#btnWriteTag").linkbutton('enable');
            }
            else    {
                hotWriteObj.poolId = -1;
                $("#usingTag").textbox('setValue', "");
                if (hotWriteObj.barcode.length>0)   {
                    $("#barcodeStatus").val("条码-标签不匹配");
                }
            }
        }
        $("#btnKillTag").linkbutton('enable');
        //
        if (row.format === "标准格式")      //不规范@
            $("#btnWrSecurityBit").linkbutton('enable');
        else
            $("#btnWrSecurityBit").linkbutton('disable');

        if (row.epcBits <80)
            $("#btnEpcSizeRebuild").linkbutton('enable');
        else
            $("#btnEpcSizeRebuild").linkbutton('disable');
    }
}


var wrTagStatus = ["写EPC失败", "写失败：不能写入User区","写失败：未能写入密码","标签安全设定失败",
        "写入后校验错","标签写入成功"];
//执行标签写入
function writeTag()   {
    if (hotWriteObj.poolId <0 || hotWriteObj.barcode.length<4)  {
        $("#barcodeStatus").val("条码-标签错误，不能写");
        $("#barcodeInput").textbox('textbox').focus();
        return (false);
    }
    $("#btnWriteTag").linkbutton('disable');
    $("#barcodeStatus").val("正在写入...");
//#    doDevCommand("tagWrite",[hotWriteObj.poolId, hotWriteObj.barcode, hotWriteObj.epc, 0], function(joRes)   {
    doDevCommand("tagWrite",[hotWriteObj.poolId, hotWriteObj.barcode, "", 0], function(joRes)   {
        if (joRes.data[0].result>=0 && joRes.data[0].result<=5) {
            $("#barcodeStatus").val(wrTagStatus[joRes.data[0].result]);
        }
        if (joRes.data[0].result ===5)   {            
            wrEventsCursor = joRes.data[0].cursorRow;
            setGridviewCursor($("#wrEventTab"), wrEventsCursor);

            $("#writedCount").textbox('setValue', joRes.data[0].wrCount);
            prev_writed_Epc = joRes.data[0].epc;

            //条码输入界面刷新
            $("#usingTag").textbox('setValue', '['+hotWriteObj.barcode+']');
            $("#barcodeInput").textbox('setValue', "");     //效果不好，但必须
            hotWriteObj.poolId = -1;
            hotWriteObj.epc = "";
            hotWriteObj.barcode = "";       //
            $("#barcodeInput").textbox('textbox').focus();  //光标，等条码输入
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
            doDevCommand("tagKill",[id], function(joRes)   {
                if (joRes.result)   {
                    wrEventsCursor = joRes.data[0].cursorRow;
                    setGridviewCursor($("#wrEventTab"), wrEventsCursor);
                    $("#killCount").textbox('setValue', joRes.data[0].killCount);

                    $("#barcodeStatus").val("标签已灭活");
                    $("#barcodeInput").textbox('textbox').focus();  //光标，等条码输入
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

//改写预定义项(安全位，EPCsize)
function writeDefinedItemWord(item_oid)     {
    var poolid = $("#foundtagTab").datagrid('getRowIndex', $("#foundtagTab").datagrid('getSelected'));
    if (poolid <0)  {
        return(false);
    }
    $("#btnWrSecurityBit").linkbutton('disable');
    $("#barcodeStatus").val("正在写入...");

    var secBit = parseInt($("#securityBitNew").combobox('getValue'));
    doDevCommand("tagWriteEpcItem",[poolid, item_oid, secBit], function(joRes)   {
        if (joRes.result)   {
            $("#barcodeStatus").val("写入成功");
            if (item_oid ===111)
            {
                //更新已知标签表格的部分字段(new epc)
                $("#foundtagTab").datagrid('updateRow', {index: poolid,
                    row: {epc : joRes.data[0].epc }
                });
                //event表显示
                wrEventsCursor = joRes.data[0].cursorRow;
                setGridviewCursor($("#wrEventTab"), wrEventsCursor);
            }

        }   else    {
            $("#barcodeStatus").val("写入失败");
        }
        $("#barcodeInput").next('span').find('input').focus();  //设置焦点
    });
    $("#btnWrSecurityBit").linkbutton('enable');
}

