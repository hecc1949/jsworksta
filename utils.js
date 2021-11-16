/*
//IP输入框格式定义
$.extend($.fn.validatebox.defaults.rules, {
    ip: {
        validator: function(value) {
            return (/\d+\.\d+\.\d+\.\d+/i.test(value));
            },
         message: 'IP地址格式不正确'
    }
});
*/
//messager扩展
(function($){
    function createWindow(title,content,buttons){
        var win=$("<div class=\"messager-body\"></div>").appendTo("body");
        win.append(content);
        if(buttons){
            var tb=$("<div class=\"messager-button\"></div>").appendTo(win);
            for(var btn in buttons){
                $("<a></a>").attr("href","javascript:void(0)").text(btn).css("margin-left",10)
                    .bind("click", eval(buttons[btn])).appendTo(tb).linkbutton();
            }
        }
        win.window({
            title:title,
            noheader:(title?false:true),
            width:300,
            height:"auto",
            modal:true,
            collapsible:false,
            minimizable:false,
            maximizable:false,
            resizable:false,
            onClose:function(){
                setTimeout(function(){
                    win.window("destroy");
                },100);
            }
        });
        win.window("window").addClass("messager-window");
        win.children("div.messager-button").children("a:first").focus();
        return win;
    };
    $.extend($.messager, {
        password:function(title,msg,fn){
            var content="<div class=\"messager-icon messager-question\"></div>"+"<div>"+msg+"</div>"+"<br/>"
                    +"<div style=\"clear:both;\"/>"+
                    "<div><input class=\"messager-input\" type=\"password\"/></div>" +"<br/>";
            var buttons={};
            buttons[$.messager.defaults.ok]=function(){
                win.window("close");
                if(fn){
                    fn($(".messager-input",win).val());
                    return false;
                }
            };
            buttons[$.messager.defaults.cancel]=function(){
                win.window("close");
                if(fn){
                    fn();
                    return false;
                }
            };
            var win=createWindow(title,content,buttons);
            win.find("input.messager-input").focus();
            return win;
        },
        login:function(title,msg,fn){
            var content="<div class=\"messager-icon messager-question\"></div>"+"<div>"+msg+"</div>"+"<br/>"
                    +"<div style=\"clear:both;\"/>"
                +"<div class=\"righttext\">Login ID: <input class=\"messager-id \" type=\"text\"/></div>"
                +"<div class=\"righttext\">Password: <input class=\"messager-pass\" type=\"password\"/></div>" +"<br/>";
            var buttons={};
            buttons[$.messager.defaults.ok]=function(){
                win.window("close");
                if(fn){
                    fn($(".messager-id",win).val(), $(".messager-pass",win).val());
                    return false;
                }
            };
            buttons[$.messager.defaults.cancel]=function(){
                win.window("close");
                if(fn){
                    fn();
                    return false;
                }
            };
            var win=createWindow(title,content,buttons);
            win.find("input.messager-id").focus();
            return win;
        }
    });
})(jQuery);

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

/*
function convertUtcTime(utcTime)  {
    var dt = new Date(utcTime);
    var month = dt.getUTCMonth()+1;
    var day = dt.getUTCDate();
    var hours = dt.getUTCHours();
    var minutes = dt.getUTCMinutes();
    var seconds = dt.getUTCSeconds();
    return(month+"/"+day+" "+hours+':'+minutes+':'+seconds);
}
*/

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

//表格列日期时间格式化显示
function formatDateTimeItem(val,rowData, rowIndex)  {
    var dt;
    if (val instanceof Date)
        dt = val;
    else
        dt = new Date(val);
    var month = dt.getMonth()+1;
    var dates = dt.getDate();
    var hours = dt.getHours();
    var minutes = dt.getMinutes();
    if(minutes<10)  {
        minutes = '0'+minutes;
    }
    return(month+"月"+dates + "日 "+ hours+":"+minutes);
}

function formatUtcDateTimeItem(val,rowData, rowIndex)  {
    var dt;
    if (val instanceof Date)
        dt = val;
    else
        dt = new Date(val);
    var month = dt.getUTCMonth()+1;
    var dates = dt.getUTCDate();
    var hours = dt.getUTCHours();
    var minutes = dt.getUTCMinutes();
    if(minutes<10)  {
        minutes = '0'+minutes;
    }
    return(month+"月"+dates + "日 "+ hours+":"+minutes);
}

//前端取文件basename
function filebasename(str) {
  var idx = str.lastIndexOf('/')
  idx = idx > -1 ? idx : str.lastIndexOf('\\')
  if (idx < 0) {
    return str
  }
  return str.substring(idx + 1);
}

//多页datagrid刷新
//rowId是当前active row在后端数据集中的index，0~N-1, <0全部重载
function setGridviewCursor($dg, row_id) {
    var pagesize = parseInt($dg.datagrid("options").pageSize);
    var pageNow =  parseInt($dg.datagrid("options").pageNumber);
    var pageno = Math.floor(row_id/pagesize) +1;

    if (pageno !== pageNow)     {
        $dg.datagrid('getPager').pagination('select', pageno);
    }
    $dg.datagrid('reload');     //刷新当前页
}

function filedownload(filename) {
    var url = '/downloadreports?filename=' + filename;
    var iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.style.display = "none";
    document.body.appendChild(iframe);
}

