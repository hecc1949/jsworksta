
function formatTime(dt)   {
    var hours = dt.getHours();
    var minutes = dt.getMinutes();
    var seconds = dt.getSeconds();
    if(hours<10)    {
        hours = '0'+hours;
    }
    if(minutes<10)  {
        minutes = '0'+minutes;
    }
    if(seconds<10)  {
        seconds = '0'+seconds;
    }
    return(hours+':'+minutes+':'+seconds);
}

//idle时钟
$(function () {
    setInterval(function(){
        $("#genClock").textbox('setValue', formatTime(new Date()));
        //附加动作:
        var pp = $("#functionMenu").accordion('getSelected');
        if (pp) {
            if ($("#functionMenu").accordion('getPanelIndex', pp) ===0) {
                $("#barcodeInput").next('span').find('input').focus();
            }
        }
    },1000);
});

//
function fileNameFromTime(index, selAll)   {
    var prefix = 'WR';
    if (index ===1) {
        prefix = 'IN';
    }   else if (selAll)    {
        prefix += 'A';
    }
    var dt = new Date();
    var year = dt.getFullYear();
    var month = dt.getMonth();
    if (month <10)  {
        month = '0'+month;
    }
    var days = dt.getDate();
    if (days <10)   {
        days = '0' + days;
    }
    var hours = dt.getHours();
    var minutes = dt.getMinutes();
    var seconds = dt.getSeconds();
    if(hours<10)    {
        hours = '0'+hours;
    }
    if(minutes<10)  {
        minutes = '0'+minutes;
    }
    if(seconds<10)  {
        seconds = '0'+seconds;
    }
    return(prefix + year + month + days + hours+minutes+seconds + ".csv");
}


//通用子函数：在datagrid中构建checkedbox表示的列项
function formatCheckedColumn(val, rowDat, rowIndex) {
    if (val)    {
        return '<input type="checkbox" name="DataGridCheckbox" checked="checked" onclick="return false">';
    }
    else {
        return '<input type="checkbox" name="DataGridCheckbox" disabled="disabled" >';
    }
}

//datagrid客户端分页
function pagerFilter(data) {
    if (typeof data.length == 'number' && typeof data.splice == 'function') {   // is array
        data = {
            total: data.length,
            rows: data
        }
    }
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
            dg.datagrid('loadData', data);
        }
    });

    if (!data.originalRows) {
        data.originalRows = (data.rows);
    }
    var start = (opts.pageNumber - 1) * parseInt(opts.pageSize);
    var end = start + parseInt(opts.pageSize);
    data.rows = (data.originalRows.slice(start, end));
    return data;
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
    para = [pagesize, begin];
    var databuf = [];
    devwrapper.execDbSql(query, para, function(joRes)   {
        if (joRes.error.code ===0)  {
            var rowNum = joRes.rows.length;
            for(var i=0; i<rowNum; i++) {
                var arow = joRes.rows[i];
                var rec = {};               //必须是local的
                if (!selTab_Invents)    {
                    rec.id = parseInt(arow[0]);
                    rec.daily_id = parseInt(arow[1]);
                    rec.context = arow[4];
                    rec.epc = arow[5];
                    rec.tagserial = arow[6];
                    rec.wrtime = arow[11];
                    rec.wrUsrBank = (parseInt(arow[8]) !== 0);
                    rec.locked = (parseInt(arow[10]) !== 0);
                    rec.remark = arow[13];
                    rec.exportMark = arow[2];
                }   else    {
                    rec.id = parseInt(arow[0]);
                    rec.invent_id = parseInt(arow[1]);
                    rec.exportMark = parseInt(arow[2]);
                    rec.inventGrp = parseInt(arow[6]);
                    rec.epc = arow[3];
                    rec.context = arow[4];
                    if (parseInt(arow[7]) ===0)
                        rec.formatId = "标准";
                    else
                        rec.formatId = "格式"+arow[7];
                    rec.updtime = arow[8];
                }

                databuf.push(rec);
            }
        }   else {
            alert("SQL exec error: "+ joRes.error.message);
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
    devwrapper.execDbSql(query, [], function(joRes)   {
        var cnt = 0;
        if (joRes.error.code ===0)  {
            var row = joRes.rows[0];
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

/*
var cfgSettings = [
    {"id":0, "name": "主机名", "group":"名称", "value": "FLT", "editor":"" },
    {"id":1, "name": "操作员", "group":"名称", "value": "A01", "editor":"text" },
    {"id":2, "name": "本机IP", "group":"网络", "value": "192.168.1.11", "editor":"" },
    {"id":3, "name": "联网方式", "group":"网络", "value": '0-有线/固定IP',
        "editor": {"type": 'combobox', "options":{"panelHeight":"auto","editable":false,
                        'data': [{'value':'0-有线/固定IP', 'text':'0-有线/固定IP'},
                        {'value':'1-有线/动态IP', 'text': '1-有线/动态IP'},{'value':'2-wifi', 'text': '2-wifi'}
                    ]}
        }},
    {"id":4, "name": "wifi热点", "group":"网络", "value": "",
         "editor": {"type": 'combobox', "options":{"panelHeight":"auto","editable":false,
                   'data': []}
        }},
    {"id":5, "name": "wifi密码", "group":"网络", "value": "", "editor":"text" },
    {"id":6, "name": "日期时间", "group":"功能", "value": "",
        "editor": {"type": 'combobox', "options":{"panelHeight":"auto","editable":false,
                  'data': [{'value':'Now', 'text':'2020-12-11 09:20:11'},
                    {'value':'NTP', 'text':'NTP-网络时间'} ]}
        }},
    {"id":7, "name": "下载升级", "group":"功能", "value": "", "editor":"text" }
];


$(function()    {
    $('#configSettings').propertygrid('loadData', cfgSettings);
})
*/

