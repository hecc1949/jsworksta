//IP输入框格式定义
$.extend($.fn.validatebox.defaults.rules, {
    ip: {
        validator: function(value) {
            return (/\d+\.\d+\.\d+\.\d+/i.test(value));
            },
         message: 'IP地址格式不正确'
    }
});


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

function convertUtcTime(utcTime)  {
    var dt = new Date(utcTime);
    var month = dt.getUTCMonth()+1;
    var day = dt.getUTCDate();
    var hours = dt.getUTCHours();
    var minutes = dt.getUTCMinutes();
    var seconds = dt.getUTCSeconds();
    return(month+"/"+day+" "+hours+':'+minutes+':'+seconds);
}

//通用子函数：在datagrid中构建checkedbox表示的列项
function formatCheckedColumn(val, rowDat, rowIndex) {
    if (val !== undefined)    {
        if (val)
            return '<input type="checkbox" name="DataGridCheckbox" checked="checked" onclick="return false">';
        else
            return '<input type="checkbox" name="DataGridCheckbox" onclick="return false">';
    }    else {
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


function getOperatorName()  {
    var opName = "";
    var rows = $('#configSettings').propertygrid('getRows');
    for(var i=0; i<rows.length; i++)    {
        if (rows[i].name ==="操作员")  {
            opName = rows[i].value;
            break;
        }
    }
    return(opName);
}


//导出文件的自动命名
function fileNameFromTime(index, selAll)   {
    var prefix = 'I';
    if (index >=1) {
        prefix = 'W';
    }
    if (selAll)
        prefix += 'A';
    var dt = new Date();
    var month = dt.getMonth()+1;
    var days = dt.getDate();
    var hours = dt.getHours();
    var minutes = dt.getMinutes();
    var seconds = dt.getSeconds();
    return(prefix + month + days + "T" + hours+minutes+seconds +"-"+ getOperatorName() +".csv");
}

