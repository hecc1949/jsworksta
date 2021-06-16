
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
//    $('#inventInfoPanel').css({fontSize: "1.1em", marginTop: '2px', marginTottom: '2px' });    //内部label字体
    $("#inventTagCount, #inventRunCount").textbox('textbox').css({
        fontSize: "1.5em", fontWeight:"bold",color:"blue"   });
    $("#inventGroupedCount, #inventUnFmtTagCount, inventCrosGrpCount").textbox('textbox').css({
        fontSize: "1.2em", color:'black' });

    $("#inventTab").datagrid('getPager').css({height:"40px"});

    $("#inventSpeed").combo('textbox').css({fontSize: "1.2em"});    //扫描速度选择框

    //全部datagrid的分页布置
    $("#wrEventTab, #inventTab, #wrEventDb, #inventDb").each(function()    {
        $(this).datagrid('getPager').pagination({
            layout: ['sep','first','prev','links','next','last','sep','refresh','info']
        });
    });
});

//
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
});

function miscDevEventLink() {
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

