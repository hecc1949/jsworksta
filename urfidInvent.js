/*
  标签点验（盘点）功能实现
 */

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

var _view2deviceDis = true;    //界面参数人工更改时，不update到设备。避免inventSpeed选择时，从设备读参数再更改回设备的loop.

//--------- views ---
$(function initInventViews()   {
    $("#inventTab").datagrid({
        loadFilter: pagerFilter,
        onSelect:function() {       //附加工作，锁住分组表格的下select光标
            $("#grptags").datalist('selectRow', m_hotInventGrpId);
        }
    });

    //扫描速度选择框
    $("#inventSpeed").combobox({
        onSelect:function(rec) {
/*            if (devwrapper !== null)    {
                devwrapper.setInventScanPeriod(rec.value);
            } */
            if (!_view2deviceDis)   {
//            console.log("period select"+JSON.stringify(rec));
                doDevCommand("inventSetScanPeriod",[rec.value]);
            }
        }
    });

    //点验执行
    $("#btnInventRun").bind('click', runInvent);

    $("#btnInventMode").linkbutton("disable");
    $("#btnInventMode").linkbutton({
        onClick: function() {
/*            if (devwrapper !== null)    {
                $("#btnInventMode").linkbutton("disable");
                devwrapper.toggleInventMode();
            } */
            doDevCommand("inventToggleMode",[], function(jores)  {
                $("#btnInventMode").linkbutton("disable");
            });
        }
    });

    $("#btnInventNewGrp").linkbutton({
        onClick: function() {
            if (devwrapper !== null && !inventRuning)  {
                inventNewGroup(false);
            }
        }
    });
    $("#btnInventFinish").linkbutton({
        disabled: true,
        onClick: doInventFinish
    });
});

//------------ dev-events ---
/*
function inventDevEventLink()  {
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
}
*/

function onInventDevMsg(jo) {
//    console.log(JSON.stringify(jo));
    if (jo.scanMultiHit !== undefined)  {
        if (jo.scanMultiHit !== 0)   {
            $("#btnInventMode").linkbutton({"text":"普通扫描"});
        }   else    {
            $("#btnInventMode").linkbutton({"text":"精细扫描"});
        }
        $("#btnInventMode").linkbutton("enable");
    }
    if (jo.scanTick !== undefined)  {
        $("#inventRunCount").textbox('setValue', jo.scanTick);
    }
    if (jo.inventTagNumber !== undefined || jo.inventFmtTagNumber !== undefined)   {
        inventCounter.foundTags = jo.inventTagNumber;
        inventCounter.contextValidTags = jo.inventFmtTagNumber;

        $("#inventTagCount").textbox('setValue', inventCounter.foundTags);
        var cnt1 = inventCounter.foundTags - inventCounter.contextValidTags + inventCounter.frameTags;
        $("#inventUnFmtTagCount").textbox('setValue', cnt1);
    }
}


function onInventDevStart()     {
//    inventCounter.foundTags = devwrapper.inventTagNumber;
//    $("#inventTagCount").textbox('setValue', inventCounter.foundTags);

//    devwrapper.getInventScanPeriod(function(val)  {
//        $("#inventSpeed").combobox('select', val);
//    });
    doDevCommand("inventGetScanPeriod",[], function(joRes)  {
//        console.log(JSON.stringify(joRes));
        var val = joRes.data[0].inventScanPeriod;
        _view2deviceDis = true;
        $("#inventSpeed").combobox('select', val);
        _view2deviceDis  = false;
    });
}

//-------------- sub utils ---------------
function clearInventPanel() {
    m_InventRecBuf.splice(0, m_InventRecBuf.length);
    m_inventGrps.splice(0, m_inventGrps.length);
    m_hotInventGrpId = 0;
    for(var key in inventCounter)   {
        inventCounter[key] = 0;
    }
/*    if (devwrapper !== null)    {
        devwrapper.inventSetGroupId(m_hotInventGrpId);
    }
*/
    doDevCommand("inventSetGroupId",[m_hotInventGrpId]);

    $("#inventTab").datagrid('loadData', {total:0, rows:[]});     //清空列表
    $("#inventTab").datagrid('getPager').pagination('select',1);    //清pageNumber
    $("#inventTagCount").textbox('setValue', "");
    $("#inventUnFmtTagCount").textbox('setValue', "");
    $("#inventCrosGrpCount").textbox('setValue', "");
    $("#inventGroupedCount").textbox('setValue', "");
    $("#inventRunCount").textbox('setValue', "");

    $("#grptags").datalist('loadData', {total:0, rows:[]});
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

//------------------ applicate functions ------------------------

var inventPrepare = false;
//启动-停止点验动作
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
//                     devwrapper.inventResetLet(true);
                     doDevCommand("inventResetLet",[true]);
                 }
             });
            inventPrepare = true;
//#            return;
        }
//        inventPrepare = true;
    }

    var scanmode = 0;   //0-自动切换普通/精细模式，也可手动； 1-普通模式，可手动切换； 2-精细模式，可手动切换
    if ($("#inventSpeed").combobox('getValue') < 200)   {
        scanmode = 2;
    }
//    var startRun = !inventRuning;
//    devwrapper.runInvent(startRun, scanmode, function(res) {
//        if (res)    {
    doDevCommand("inventRun",[!inventRuning, scanmode], function(joRes)    {
        if (joRes.result)   {
//            console.log(JSON.stringify(joRes));
            //界面显示更新
//            if (startRun)   {
            if (joRes.data[0].active)   {
                $("#btnInventRun").linkbutton({"text":"停止"});
                $("#btnInventNewGrp").linkbutton("disable");
                $("#inventSpeed").combobox("disable");
                $("#btnInventFinish").linkbutton("disable");

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
                $("#btnInventNewGrp").linkbutton("enable");
                $("#inventSpeed").combobox("enable");
                $("#btnInventFinish").linkbutton("enable");
            }
            inventRuning = joRes.data[0].active;
//            inventRuning = startRun;
        }
    });
}

var refreshHold = false;
//接收到标签报告时的处理
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
                    row:{text: jo.context, value: m_hotInventGrpId+1    }});    //替换"-未定义分组标签"
            }   else    {
                $("#grptags").datalist('appendRow',{text: jo.context, value: grprows.length});    //加到分组表
            }
            inventCounter.frameTags++;
        }
        return;
    }   else    {           //普通标签
        if (jo.formatId ===0)   {
            rec.formatId = "标准";
        }   else if (jo.formatId < 0)   {
            rec.formatId = "空白";
        }   else    {
            rec.formatId = "兼容格式"+ jo.formatId;
        }
        if (jo.modversion !== undefined)    {
            rec.formatId += ("/"+(parseInt(jo.modversion)+1));
        }
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
            rec.securityBit = (parseInt(jo.securityBit) !==0);
        }
    }   else    {               //重复发现
        //在有推入分组m_inventGrps[]和分离书架标签的情况下，jo.id与m_InventRecBuf[]缓存数组索引的关系被打乱，只能硬搜索
        try {
            m_InventRecBuf.forEach(function(row, rid)   {
                if (row.id === jo.id)   {
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

//开启新分组
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
    //开启新分组：分组（书架标签）表增加行并选择
    if (grprows.length <=m_hotInventGrpId)   {
        $("#grptags").datalist('appendRow',{text:'-未指定标签', value: (m_hotInventGrpId+1)});
    }
    $("#grptags").datalist('selectRow', m_hotInventGrpId);

    //与dev端同步。m_hotInventGrpId更改后必须做
//    devwrapper.inventSetGroupId(m_hotInventGrpId);
    doDevCommand("inventSetGroupId",[m_hotInventGrpId]);
    m_inventCrossGrpCount = 0;
    $("#inventCrosGrpCount").textbox('setValue', 0);

    if (saveHotOnly)
        return;
    //ajax发送已完成的分组
    if (m_inventGrps.length >0 && m_setting.serverIp.length>0)     {
        sendHotInventReport();
    }
}

//向服务器上报
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
            clearInventPanel();
//            devwrapper.inventResetLet(true);        //不再用导出csv来清exportmark
            doDevCommand("inventResetLet",[true]);      //清exportmark, 不导出csv
        }   else    {
            $.messager.alert('导出文件失败', "未联网上报的数据保存文件出错",'error');
        }
    });
}

//手工结束点验
function doInventFinish()   {
    if (inventRuning)   return(false);
    if (m_InventRecBuf.length===0 && m_inventGrps.length===0)   {
        if (inventCounter.foundTags >0) {
            $.messager.confirm('结束点验', '数据已联网上报，清除记录不再导出?', function(r){
                if (r)  {
//                    devwrapper.inventResetLet(true);        //不再用导出csv来清exportmark
                    doDevCommand("inventResetLet",[true]);      //清exportmark, 不导出csv
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
                    else    {
                        //强行清空
                        doDevCommand("inventResetLet",[true]);      //清exportmark, 不导出csv
                        m_inventGrps.splice(0, m_inventGrps.length);
                        clearInventPanel();
//                        return(false);  //
                    }
                });
            }   else    {
                clearInventPanel();
                $.messager.confirm('结束点验', '数据已联网上报，清除记录不再导出?', function(r){
                    if (r)
//                        devwrapper.inventResetLet(true);        //不再用导出csv来清exportmark
                        doDevCommand("inventResetLet",[true]);      //清exportmark, 不导出csv
                })
            }
        });
    }
    return(true);
}

