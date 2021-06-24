
//全部界面控件的style补充，在css文件中做不了的设置在此实现
$(function setupViewStyle()  {
    $("#genClock").textbox('textbox').css({fontSize: "2.0em", fontWeight:"bold",
        color:"blue", textAlign:'center',
        backgroundColor: 'rgb(122,155,220)',
        height:'50px',
        marginTop : '0px'});
    $("#wrtagPanel, #inventPanel,#dbManagePanel,#configPanel").panel('panel').css({
        padding:'0', border: '0',
        margin:'0px'    });     //不需要

    $(".easyui-linkbutton").linkbutton({
        height: '36px'      //or: size: 'large'
        });     //所有button设置高度。

    //写标签界面的text控件
    $("#barcodeInput").textbox('textbox').css({ fontSize: "1.5em", fontWeight:"bold",color:"blue"   });
    $("#usingTag").textbox('textbox').css({ fontSize:'1.1em', backgroundColor: 'rgb(225, 231, 206)' });

    $("#writedCount").textbox('textbox').css({  fontSize: "1.8em", fontWeight:"bold",color:"blue"   });
    $("#killCount").textbox('textbox').css({    fontSize: "20pt", fontWeight:"bold",color:"black"   });
    $("#wrEventTab").datagrid('getPager').css({height:"40px"});

    //点验界面
    $("#inventTagCount, #inventRunCount").each(function()   {
        $(this).textbox('textbox').css({fontSize: "1.5em", fontWeight:"bold",color:"blue"});
    });
    $("#inventUnFmtTagCount, #inventGroupedCount,#inventCrosGrpCount").each(function()   {
        $(this).textbox('textbox').css({fontSize: "1.2em", fontWeight:"bold",color:"black"});
    });

    $("#inventTab").datagrid('getPager').css({height:"40px"});

    $("#inventSpeed").combo('textbox').css({fontSize: "1.2em"});    //扫描速度选择框

    //全部datagrid的分页布置
    $("#wrEventTab, #inventTab, #wrEventDb, #inventDb").each(function()    {
        $(this).datagrid('getPager').pagination({
            layout: ['sep','first','prev','links','next','last','sep','refresh','info']
        });
    });
});

//数据管理&系统配置及分页主菜单的配置
$(function initMiscViews()  {
    //主菜单
    $("#functionMenu").accordion({ onSelect: functionsMain    });
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
//                devwrapper.exportDbRecords(tabsel, filename, function(jo)   {
                doDevCommand("miscExportDbRecords",[tabsel. filename], function(joRes)  {
                    var jo = joRes.data[0];
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
//        devwrapper.imeEnable(true);
        doDevCommand("sysImeEnable",[true]);
    });
    $("#exportTofile").textbox('textbox').blur(function()  {
//        devwrapper.imeEnable(false);
        doDevCommand("sysImeEnable",[false]);
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
//            devwrapper.setSysConfigs(rows, function(updCnt)    {
            doDevCommand("miscSetSysConfigs", rows, function(joRes) {
                var updCnt = joRes.data[0].updateCount;
                if (updCnt>0)   {
                    $("#configApply").linkbutton("disable");
                    setTimeout(function() {
//                        devwrapper.getSysConfigs(function(res) {
//                            $('#configSettings').propertygrid('loadData', res);
                        doDevCommand("miscGetSysConfigs",[], function(joRes)    {
                            $('#configSettings').propertygrid('loadData', joRes.data);
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
//                            devwrapper.sysClose();
                            doDevCommand("sysClose",[]);
                        }
                    }
                });
            }   else    {
                $.messager.confirm({title:'退出系统', msg: '确定要退出程序？',
                    fn: function(r){
                        if (r)  {
//                            devwrapper.sysClose();
                            doDevCommand("sysClose",[]);
                        }
                    }
                });
            }
        }
    });
});

function miscDevEventLink() {
    //一般配置，读出
//    devwrapper.getSysConfigs(function(res) {
//        $('#configSettings').propertygrid('loadData', res);
    doDevCommand("miscGetSysConfigs",[], function(joRes)    {
        $('#configSettings').propertygrid('loadData', joRes.data);
    });
    //IP输入框
//    devwrapper.loadJsonTextFile("setting.json", function(res){
//    jo = JSON.parse(res);
    doDevCommand("miscLoadJsonFile", ["setting.json"], function(joRes)    {
//        console.log("get:"+joRes.data[0].text);
        jo = JSON.parse(joRes.data[0].text);
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
//                devwrapper.saveJsonTextFile(JSON.stringify(m_setting),"setting.json");
                doDevCommand("miscSaveToJsonFile", [JSON.stringify(m_setting), "setting.json"]);
            }
        }
    });
}

//------------- ---------------------------------------------------

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
//            devwrapper.setInventifyMode(selInvent, function(result)    {
//            if (!result)    {
            doDevCommand("selectInventMode",[selInvent], function(joRes)  {
                if (!joRes.result)    {
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
//            devwrapper.imeEnable(true);
            doDevCommand("sysImeEnable",[true]);
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
//            devwrapper.getExtMediaPath(function(fpath)  {
//            m_locfile_mediaPath = fpath;
            doDevCommand("miscGetExtMediaPath",[], function(joRes)  {
                var fpath = joRes.data[0].fpath;
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
//            devwrapper.imeEnable(true);
            doDevCommand("sysImeEnable",[true]);
        }   else    {
//            devwrapper.imeEnable(false);
            doDevCommand("sysImeEnable",[false]);
        }
    }
}


//-------数据库管理相关 ---------------------------------------------
/**
//# local database(booktags.db)的table/fields定义：
const tabWritedtagsFieldNames = ["id", "dailycount", "exportMark", "epcBytes",
        "itemIdentifier", "EPC", "tagSerialNo",
        "aversion", "usrBankWrited", "passwdWrited", "lockAction",
        "writetime", "operatorName", "remark"];
const tabInventsFieldNames = ["id", "invent_id", "exportMark",
        "EPC", "itemIdentifier",
        "exlink","grp_id","grp_id2","updtime"];
*/
//用sql读取数据库的一页数据，转换成datagrid显示
function loadDbRecords(selectMark, $dg, begin, pagesize, callback)    {
    var selTab_Invents = false;
    var query = "Select * from ";
    if ($dg.attr("id") === "wrEventDb" )    {
        query += "writedtags ";
    }   else    {
        query += "invents ";
        selTab_Invents = true;
    }
    if (selectMark >=0) {
        query += (" where exportMark = " + selectMark);
    }
    query += " limit ? offset ?";
//    para = [pagesize, begin];
    var databuf = [];
//    devwrapper.execDbSql(query, para, function(joRes)   {
    doDevCommand("miscExecDbSql", [query, pagesize, begin], function(joRes)  {
//        if (joRes.error.code ===0)  {
        if (joRes.data[0].error.code ===0)  {
//            var rowNum = joRes.rows.length;
            var rowNum = joRes.data[0].rows.length;
            for(var i=0; i<rowNum; i++) {
//                var arow = joRes.rows[i];
                var arow = joRes.data[0].rows[i];
                var rec = {};               //必须是local的
                if (!selTab_Invents)    {               //writedtags table
                    rec.id = parseInt(arow[0]);
                    rec.daily_id = parseInt(arow[1]);
                    rec.context = arow[4];
                    rec.epc = arow[5];
                    rec.tagserial = arow[6];
                    rec.wrtime = convertUtcTime(arow[11]);
                    rec.wrUsrBank = (parseInt(arow[8]) !== 0);
                    rec.locked = (parseInt(arow[10]) !== 0);
                    rec.remark = arow[13];
                    rec.exportMark = arow[2];
                }   else    {                           //invents table
                    rec.id = parseInt(arow[0]);
                    rec.invent_id = parseInt(arow[1]);
                    rec.exportMark = parseInt(arow[2]);
                    rec.inventGrp = parseInt(arow[6]) +1;
                    rec.epc = arow[3];
                    rec.context = arow[4];
                    if (parseInt(arow[7]) ===0)
                        rec.formatId = "标准";
                    else if (parseInt(arow[7]) <0)
                        rec.formatId = "空白";
                    else
                        rec.formatId = "格式"+arow[7];
                    rec.updtime = convertUtcTime(arow[8]);
                }

                databuf.push(rec);
            }
        }   else {
//            alert("SQL exec error: "+ joRes.error.message);
            alert("SQL exec error: "+ joRes.data[0].error.message);
        }
        //传递到loadData显示
        if (callback)   {
            callback(databuf);
        }
    });
}

//初始化表格显示，查询记录总数作为分页参数，并读出第一页显示
function dbViewInit(selectMark, $dg)     {
    var query;
    if ($dg.attr("id") === "wrEventDb" )
        query = "Select Count(*) from writedtags";
    else
        query = "Select Count(*) from invents";
    if (selectMark >=0)    {
        query += (" where exportMark=" + selectMark);
    }
//    devwrapper.execDbSql(query, [], function(joRes)   {
    doDevCommand("miscExecDbSql", [query], function(joRes)  {
        var cnt = 0;
//        if (joRes.error.code ===0)  {
        if (joRes.data[0].error.code ===0)  {
//            var row = joRes.rows[0];
            var row = joRes.data[0].rows[0];
            cnt = parseInt(row[0]);
        }
        var pageSize = $dg.datagrid('options').pageSize;
        loadDbRecords(selectMark, $dg, 0, pageSize, function(dat)    {
            data = {
                total: cnt,
                rows: dat
            }
            $dg.datagrid('loadData', data);
        });
    })
}

//sql浏览database的分页实现(=> datagrid.loadFilter)
function pagerQueryDb(data) {
    var dg = $(this);
    var opts = dg.datagrid('options');
    var pager = dg.datagrid('getPager');
    pager.pagination({
        onSelectPage: function (pageNum, pageSize) {
            opts.pageNumber = pageNum;
            opts.pageSize = pageSize;
            pager.pagination('refresh', {
                pageNumber: pageNum,
                pageSize: pageSize
            });
            var selAct = -1;
            if ($("#dbExportMarkSel").switchbutton("options").checked)
                selAct = 0;
            loadDbRecords(selAct, dg, (pageNum-1)*pageSize, pageSize, function(pagedat)    {
                data.rows = pagedat;
                dg.datagrid('loadData', data);
            });
        }
    });

    return data;
}

//--- 文件功能 ---------------------------------------------
//csv文件上传
function uploadDatfiles(newValue, oldValue)   {
    var files = $("#uploadfiles").filebox('files');     //
//    var files = $(this).next().find('input[type=file]')[0].files;   //
    if (!files || files.length ===0)  {
        console.log("no file");
        return;
    }
    var formData = new FormData();
    $.each(files, function(i, file)    {
        formData.append('upfiles', file);
    });
    var upurl = "http://" + m_setting.serverIp + ":2280/worksta/uploadFile";
    $.ajax({
        url: upurl,
        type:"POST",
        data:formData,
        timeout: 800,           //!
        processData:false,
        contentType:false,
        success:function(res)   {
            if (res)    {
                var msg;
                if (files.lenght<2)
                    msg = +newValue;
                else
                    msg = files.length + "个文件.";
                $.messager.alert("文件上传成功", "已上传文件:<br/>"+msg, 'info');
            }
        },
        error: function(err)    {
            $.messager.alert('文件上传失败', '没有联网，上传地址(URL)错误，或接收服务没有开启'+m_setting.serverIp,'error');
        }
    })
}

//本地文件管理：复制到u盘和删除
function locFileOperate(cmd)    {
    if (devwrapper === null)
        return;
//    devwrapper.doSysFileOpenDialog("csv", "csv files(*.csv),text files(*.txt)", function(filenames)    {
    doDevCommand("miscSelectLocFiles",["csv", "csv files(*.csv),text files(*.txt)"], function(joRes)    {
        var filenames = joRes.data[0].filenames;
//        if (filenames.length ===0)
        if (!joRes.result)
            return;
        var targetPath = "";
        if (cmd ==="copy")
            targetPath = m_locfile_mediaPath;
//        devwrapper.doSysFileCommand(cmd, filenames, targetPath, function(res)   {
        doDevCommand("miscRunLocFileCommand", [cmd, filenames, targetPath], function(joRes)   {
            var res = joRes.data[0];
                if (res.error ===0)     {
                    $.messager.alert('文件', res.message, 'info');
                }   else    {
                    $.messager.alert('文件处理错误', res.message, 'error');
                }
        });
    });
}

