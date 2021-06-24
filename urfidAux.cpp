#include "urfidwrapper.h"
#include "containerwindow.h"
#include <QDebug>
//#include <QMainWindow>
//#include <QStatusBar>
#include <QFileDialog>
#include <QHostInfo>
#include <QTreeView>

void URfidWrapper::sysClose()
{
    if (wrProxy.identifyRuning)
        wrProxy.identifyRun(false);
    if (invent.scanRuning)
        invent.runInventify(false);

    ContainerWindow *mainwin = qobject_cast<ContainerWindow*>(this->parent());
    mainwin->safeClose();
}


QJsonObject URfidWrapper::execDbSql(QString queryCmd, QJsonArray param)
{
    QJsonObject joRes;
    QJsonObject joErr;
    QJsonArray joRows;
    joRes["rows"] = joRows;
    joErr["code"] = -1;
    joErr["message"] = "no using database";
    if (wrProxy.dbstore==NULL || invent.dbstore==NULL)
    {
        joRes["error"] = joErr;
        return(joRes);
    }
    //
    bool isSelect = queryCmd.contains("Select", Qt::CaseInsensitive);
    int paraCnt = 0;
    for (int i=0; i<queryCmd.length(); i++)
    {
        if ((queryCmd.constData())[i] == '?')
            paraCnt++;
    }
    if (paraCnt != param.count())
    {
        joErr["message"] = "parameter error";
        joRes["error"] = joErr;
        return(joRes);
    }
    //
    QSqlQuery sql(dbstore._db);
    sql.prepare(queryCmd);
    for (int i=0; i<param.count(); i++)
    {
        sql.bindValue(i, param.at(i).toVariant());
    }
    if (sql.exec())
    {
        joErr["code"] = 0;
        joErr["message"] = "exec_sql success";
        joRes["error"] = joErr;
        if (isSelect)
        {
            QSqlRecord rec = sql.record();
            int fieldNum = rec.count();
            while(sql.next())
            {
                QJsonArray row;
                for (int col=0; col<fieldNum; col++)
                {
                    row.append(sql.value(col).toString());
                }
                joRows.append(row);
            }
        }
        joRes["rows"] = joRows;
    }
    else
    {
        joErr["code"] = sql.lastError().type();
        joErr["message"] = sql.lastError().text();
        joRes["error"] = joErr;
    }
    return(joRes);
}

QJsonObject URfidWrapper::exportDbRecords(int tabSelect, QString filename)
{
    QJsonObject joRes;
    joRes["error"] = -1;
    joRes["message"] = "";
    joRes["records"] = 0;
    QFileInfo finfo = QFileInfo(filename);
    QString mfilename = finfo.completeBaseName();
    if (mfilename.length() < 2)
    {
        joRes["message"] = "error filename.";
        return(joRes);
    }
    mfilename = mfilename+ ".csv";
    if (QFile::exists(mfilename))
    {
        joRes["message"] = "file exists, can not overwrite.";
        return(joRes);
    }
    if (!QDir(QCoreApplication::applicationDirPath() + "/csv/").exists())
    {
        QDir(QCoreApplication::applicationDirPath()).mkdir("csv");
    }
    mfilename = QCoreApplication::applicationDirPath() + "/csv/" + mfilename;
    if (tabSelect<0 || tabSelect>3)
    {
        joRes["message"] = "table select error.";
        return(joRes);
    }
    //
    int res;
    if (tabSelect >=2)
        res = dbstore.exportToCsv(mfilename, tabSelect-2);
    else
        res = dbstore.inventExport2csv(mfilename, tabSelect);

    if (res <0)
    {
        joRes["error"] = -2;
        joRes["message"] = QString("数据导出时出错:%1").arg(res);
    }
    else
    {
        joRes["error"] = 0;
        joRes["records"] = res;
        joRes["message"] = QString("数据导出成功，共:%1 条记录").arg(res);
    }
    //
    if (tabSelect ==2)
    {
        wrProxy.writeRec.dailyCount = 0;
        wrProxy.killAuxRec.dailyCount = 0;
        QJsonObject jo;
        jo.insert("writedCount", wrProxy.writeRec.dailyCount);
        jo.insert("killCount", wrProxy.killAuxRec.dailyCount);
        sendTagwrRunValue(jo);
    }
    else if (tabSelect ==0)
    {
        invent.inventClear(false);      //硬清除
        _inventScanTick = 0;
//        emit(inventScanChanged());
        sendInventCounts();
    }
    //
    return(joRes);
}

QString URfidWrapper::getExtMediaPath()
{
    QSettings* ini = new QSettings("./config.ini",QSettings::IniFormat);
    QString tfcardPath = ini->value("/Operator/TFCardPath").toString();
    if (tfcardPath.length()==0)
        tfcardPath = "/media/hcsd";
    QString udiskPath = ini->value("/Operator/UDiskPath").toString();
    if (udiskPath.length()==0)
        udiskPath = "/media/udisk";

    if (QDir("/").exists(udiskPath))
        return(udiskPath);
    else if (QDir("/").exists(tfcardPath))
        return(tfcardPath);
    else
        return("");
}

QString URfidWrapper::doSysFileOpenDialog(QString initDir, QString filter)
{
    QFileDialog selfile;
    selfile.setDirectory(initDir);
    QStringList filt = filter.split(",");
    selfile.setNameFilters(filt);

    selfile.setFileMode(QFileDialog::ExistingFiles);    //按住Ctrl可以多选
    selfile.setAcceptMode(QFileDialog::AcceptOpen);
    selfile.setWindowTitle("选择文件");      //无效
    selfile.setLabelText(QFileDialog::LookIn,"路径");
    selfile.setLabelText(QFileDialog::FileName,"文件名");
    selfile.setLabelText(QFileDialog::FileType,"文件类型");
    selfile.setLabelText(QFileDialog::Accept, "选择");
    selfile.setLabelText(QFileDialog::Reject, "取消");
    selfile.setOptions(QFileDialog::DontUseNativeDialog);   //不用系统Gtk Dialog
    selfile.setViewMode( QFileDialog::Detail);
    //实现多文件选择
    QTreeView *pTreeView = selfile.findChild<QTreeView*>("treeView");
    if (pTreeView)
    {
        pTreeView->setSelectionMode(QAbstractItemView::MultiSelection);
    }
    selfile.setFixedSize(720, 720);

    QString filenames = "";
    if (selfile.exec()==QDialog::Accepted)
    {
        QStringList files = selfile.selectedFiles();
        for(int i=0; i<files.count(); i++)
        {
            filenames += files[i];
            if (i != files.count()-1)
                filenames += ",";
        }
    }
    return(filenames);
}

QJsonObject URfidWrapper::doSysFileCommand(QString cmd, QString srcFiles, QString dstPath)
{
    QJsonObject joRes;
    joRes["error"] = 0;
    joRes["message"] = "";
    int rescnt = 0;
    QStringList files = srcFiles.split(",");
    foreach(QString filename, files)
    {
        if (cmd.compare("copy", Qt::CaseInsensitive)==0)
        {
            if (!QFile(dstPath+"/"+QFileInfo(filename).fileName()).exists())    //copy时有文件QFILE不会覆盖，返回false
            {
                if (QFile::copy(filename, dstPath +"/"+QFileInfo(filename).fileName()))
                {
                   rescnt++;
                }
            }
        }
        else if (cmd.compare("delete", Qt::CaseInsensitive)==0 || cmd.compare("remove", Qt::CaseInsensitive)==0)
        {
            if (QFile::remove(filename))
            {
                rescnt++;
            }
        }
    }
    QString typemsg;
    if (cmd.compare("copy", Qt::CaseInsensitive)==0)
        typemsg = "复制";
    else
        typemsg = "删除";

    if (rescnt == files.count())
    {
        joRes["message"] = QString("%1 个文件%2成功").arg(rescnt).arg(typemsg);
    }
    else
    {
        joRes["error"] = 1;
        joRes["message"] = QString("文件%1出错。已%1 %2个").arg(typemsg).arg(typemsg).arg(rescnt);
    }
    return(joRes);
}

QJsonArray URfidWrapper::getSysConfigs()
{
    QJsonArray joRes;
    QJsonObject jRow;
    QJsonObject jCombo, jComboOpt, jComboOptItem;
    QJsonArray jComboItems;
    ContainerWindow *mainwin = qobject_cast<ContainerWindow*>(this->parent());

    //group-1
    jRow["group"] = "名称";
    jRow["name"] = "主机名";
    jRow["value"] = QHostInfo::localHostName();
    jRow["editor"] = "";
    joRes.append(jRow);
    jRow["name"] = "版本号";
    jRow["value"] = VERSION_STRING;
    jRow["editor"] = "";
    joRes.append(jRow);

    jRow["name"] = "操作员";
    jRow["value"] = wrProxy.writeRec.operatorName;
    jRow["editor"] = "text";
    joRes.append(jRow);
    //group-2
    jRow["group"] = "网络";
    jRow["editor"] = "";
    jRow["name"] = "联网状态";
    if (mainwin->m_netInfo.netStatus ==2)
        jRow["value"] = "wifi";
    else if (mainwin->m_netInfo.netStatus ==1)
        jRow["value"] = "有线网络";
    else
        jRow["value"] = "离线";
    joRes.append(jRow);

    jRow["name"] = "本机IP";
    if (mainwin->m_netInfo.netStatus ==0)
        jRow["value"] = "";
    else
        jRow["value"] = mainwin->m_netInfo.Ip;
    joRes.append(jRow);

    jRow["name"] = "Wifi热点";
    int ssid_cnt = mainwin->m_netInfo.ssidList.count();
    for(int i=0; i<ssid_cnt; i++)
    {
        jComboOptItem["value"] = mainwin->m_netInfo.ssidList.at(i);
        jComboOptItem["text"] = mainwin->m_netInfo.ssidList.at(i);
        jComboItems.append(jComboOptItem);
    }
        //layer-2
    jComboOpt["data"] = jComboItems;
    jComboOpt["panelHeight"] = "auto";
    jComboOpt["editable"] = (ssid_cnt ==0);
        //layer-1
    jCombo["options"] = jComboOpt;
    jCombo["type"] = "combobox";
        //layer-0
    jRow["editor"] = jCombo;
    if (ssid_cnt==0)
        jRow["value"] = "";
    else
        jRow["value"] = mainwin->m_netInfo.ssidList.at(0);
    joRes.append(jRow);

    jRow["name"] = "Wifi密码";
    jRow["value"] = "";
    if (mainwin->m_netInfo.netStatus ==1)
        jRow["editor"] = "";
    else
        jRow["editor"] = "text";
    joRes.append(jRow);
    //group-3
    jRow["group"] = "功能";
    jRow["name"] = "日期时间";
        //layer-3
    QString nowstr = QDateTime::currentDateTime().toString("yyyy-M-d hh:mm:ss");
    while(!jComboItems.isEmpty())
    {
        jComboItems.removeAt(0);
    }
    jComboOptItem["value"] = nowstr;
    jComboOptItem["text"] = nowstr;
    jComboItems.append(jComboOptItem);
    jComboOptItem["value"] = "NTP-网络时间";
    jComboOptItem["text"] = "NTP-网络时间";
    jComboItems.append(jComboOptItem);
        //layer-2
    jComboOpt["data"] = jComboItems;
    jComboOpt["panelHeight"] = "auto";
    jComboOpt["editable"] = false;
        //layer-1
    jCombo["options"] = jComboOpt;
    jCombo["type"] = "combobox";
        //layer-0
    jRow["editor"] = jCombo;
    jRow["value"] = nowstr;
    joRes.append(jRow);

    //
    jRow["name"] = "文件升级";
    jRow["editor"] = "text";
    jRow["value"] = _xupdatePrompt;
    joRes.append(jRow);

    return(joRes);
}

int URfidWrapper::setSysConfigs(QJsonArray param)
{
    if (param.count() <1)
        return(0);
    int updCnt = 0;
    QString reqSsid = "", reqPsk = "";
    QString reqOperator = "";
    bool reqNtp = false;
    QString reqUpdUrl = "";

    for(int i=0; i<param.count(); i++)
    {
        QJsonObject jRow;
        jRow = param.at(i).toObject();
        QString idname = jRow["name"].toString();
        if (idname == "操作员")
            reqOperator = jRow["value"].toString();
        else if (idname == "Wifi热点")
            reqSsid = jRow["value"].toString();
        else if (idname == "Wifi密码")
            reqPsk = jRow["value"].toString();
        else if (idname == "日期时间")
            reqNtp = (jRow["value"].toString().indexOf("NTP") >=0);
        else if (idname == "文件升级")
            reqUpdUrl = jRow["value"].toString();
    }

    ContainerWindow *mainwin = qobject_cast<ContainerWindow*>(this->parent());
    if (mainwin->m_netInfo.netStatus !=0)
    {
        if (reqNtp)
        {
            emit mainwin->netChecker->runNtpDate();
            updCnt++;
        }
        if (reqUpdUrl.length()>0)   {}  //waiting....
    }
    if (reqOperator.length()>0)
    {
        QSettings* ini = new QSettings("./config.ini",QSettings::IniFormat);
        ini->setValue("/Operator/OperatorName", reqOperator);
        wrProxy.writeRec.operatorName = reqOperator;
        wrProxy.killAuxRec.operatorName = reqOperator;
        updCnt++;
    }
    if (reqSsid.length()>0 && reqPsk.length()>0)
    {
        mainwin->netChecker->addWifiAp(reqSsid, reqPsk);
        updCnt +=2;
    }
    //
    QString fpath = getExtMediaPath();
    if ((reqUpdUrl == "file:/" + fpath)&& fpath.length()>0)
    {
        system("./cpupdfile.sh");
        _xupdatePrompt = "文件已复制，重启更新";
        updCnt++;
    }

    return(updCnt);
}

QByteArray URfidWrapper::loadJsonTextFile(QString path)
{
    QFile loadFile(path);
    if (!loadFile.open(QIODevice::ReadOnly))
        return("");
    if (QString::compare(QFileInfo(loadFile).suffix(),"txt", Qt::CaseInsensitive) ==0)
    {
        QStringList strList;
        while(!loadFile.atEnd())
        {
            QByteArray line = loadFile.readLine();
            strList.append(line.trimmed());
        }
        QJsonArray jarray = QJsonArray::fromStringList(strList);
        QJsonDocument doc;
        doc.setArray(jarray);
        return(doc.toJson());
    }
    //是Json object
    QByteArray jsonDat = loadFile.readAll();
    loadFile.close();
    QJsonParseError json_err;
    QJsonDocument jDoc = QJsonDocument::fromJson(jsonDat, &json_err);
    if (json_err.error != QJsonParseError::NoError)
        return("");
    if (!jDoc.isObject())
        return("");
    //对比原ByteArray，Tab(\t)用空格替代了，换行(\n)保留，主要的是，条目按Key重新排序了
    return(jDoc.toJson(QJsonDocument::Compact));
}

bool URfidWrapper::saveJsonTextFile(QByteArray joStr, QString path)
{
    QFile jfile(path);
    if (!jfile.open(QIODevice::WriteOnly | QIODevice::Text))
        return(false);
    QTextStream out(&jfile);

    QJsonDocument doc = QJsonDocument::fromJson(joStr);
    if (doc.isNull())
    {
        jfile.close();
        return(false);
    }
    if ((QString::compare(QFileInfo(jfile).suffix(),"txt", Qt::CaseInsensitive) ==0) && doc.isArray())
    {
        QJsonArray jArray = doc.array();
        for(int i=0; i<jArray.count(); i++)
        {
            out<<jArray.at(i).toString()<<"\r\n";
        }
        jfile.flush();
        jfile.close();
        return(true);
    }

    if (!doc.isObject())
    {
        jfile.close();
        return(false);
    }
    QByteArray dat = doc.toJson(QJsonDocument::Indented);   //保留标准格式
    out<<dat;
    jfile.flush();
    jfile.close();
    return(true);
}
