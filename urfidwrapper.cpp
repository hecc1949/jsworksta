#include "urfidwrapper.h"
#include "containerwindow.h"
#include <QDebug>
#include <QMainWindow>
#include <QStatusBar>

URfidWrapper::URfidWrapper(QObject *parent) : QObject(parent),
    wrProxy(this), invent(this)
{
    //QMetatype注册
    qRegisterMetaType<IdentifyEPC_t>("IdentifyEPC_t");
    qRegisterMetaType<Membank_data_t>("Membank_data_t");
    qRegisterMetaType<InventifyRecord_t>("InventifyRecord_t");

    wrProxy.srcdatFmt = &srcformat;
    invent.srcdatFmt = &srcformat;

}

URfidWrapper::~URfidWrapper()
{
    invent.rfidDev = NULL;      //欺骗一下invent类，避免重复delete rfidDev
}

void URfidWrapper::closeServer()
{
    QJsonObject joRes;
    joRes["event"] = "devMsg";
    QJsonArray param;
    QJsonObject jo;
    jo.insert("serverClose", 1);
    param.append(jo);
    joRes["param"] = param;

    emit(deviceEvent(joRes));
}

//-----------------------------------------------------------------------------------------
//      1. webchannel接收命令，与上层接口
//------------------------------------------------

QJsonObject URfidWrapper::doCommand(QString cmd, QJsonArray param)
{
    QJsonObject joRes;
    bool res;
//    qDebug()<<"cmd:"<<cmd;
    if (cmd == "openURfidWitor")
    {
        res = openURfidWritor(param[0].toInt(), param[1].toBool());
        joRes["result"] = res;
    }
    else if (cmd == "selectInventMode")
    {
        res = setInventifyMode(param[0].toBool());
        joRes["result"] = res;
//        qDebug()<<"CPP-selectInventMode:"<<res<<" req="<<param[0].toBool();
    }
    else if (cmd.indexOf("invent")>=0)
    {
        joRes = doInventCommand(cmd, param);
    }
    else if (cmd.indexOf("tag")>=0)
    {
        joRes = doTagwrCommand(cmd, param);
    }
    else if (cmd.indexOf("sys")==0)
    {
        if (cmd == "sysClose")
        {
//            if (param[0].toInt() ==1)   //param0=_clientID, 本机=1.
            {
                sysClose();
            }
        }
        else  if (cmd == "sysImeEnable")
        {
//            if (param[1].toInt() ==1)   //param1=_clientID, 本机=1.
            {
//                qDebug()<<"request open IME";
                emit(setImeEnble(param[0].toBool()));
            }
        }
        else if (cmd =="sysShowToolbar")
        {
            ContainerWindow *mainwin = qobject_cast<ContainerWindow*>(this->parent());
            mainwin->localTools->setAutoShow(param[0].toInt());
        }
        joRes["result"] = true;
    }
    else if (cmd.indexOf("misc")==0)
    {
        joRes = doMiscCommand(cmd, param);
    }
//    joRes["cmd"] = cmd;
//    qDebug()<<"do command:"<<cmd;
    return(joRes);
}

QJsonObject URfidWrapper::doInventCommand(QString cmd, QJsonArray param)
{
    QJsonObject joRes;
    joRes.insert("result", true);
    bool res = false;
//    qDebug()<<"cmd:"<<cmd<<param[0].toArray();
    if (cmd == "inventRun")
    {
        //cmd='inventRun', param[] = [start/stop, scanmode]
        bool start = false;
        bool devactive = false;
        if (param.count()>0)
            start = param[0].toBool();
        int scanMultiMode = 0;
#ifdef ARM
        int mode = 0;
        if (param.count()>1)
            mode = param[1].toInt();
        if (mode <0 || mode>5 || mode==3)   //可选模式：0-自动, 1-单次命中，2-多次命中， 4-多次，S0，与WriteTag相同
            mode = 0;
        res = invent.runInventify(start, mode);     //返回命令是否执行成功
        if (res && start)
        {
            if (mode ==2 || mode==4)
                scanMultiMode =1;
        }
#endif
        if (res)
        {
            devactive = start;     //转换成是否在扫描状态
        }
        QJsonArray dat;
        QJsonObject jo;
        jo.insert("active", devactive);
        jo.insert("scanMultiHit", scanMultiMode);        //1- multiHit, 0 -single report
        dat.append(jo);

        joRes["result"] = res;
        joRes.insert("data", dat);
    }
    else if (cmd == "inventToggleMode")
    {
        if (invent.scanRuning && invent.req_chgScanMode==0)
        {
            invent.req_chgScanMode = 1;
            res = true;
        }
        joRes["result"] = res;
    }
    else if (cmd == "inventResetLet")
    {
        bool clearUnExport = false;
        if (param.count()>0)
            clearUnExport = param[0].toBool();
        if (!invent.scanRuning)     //#
        {
            invent.inventClear(clearUnExport);
            res = true;
        }
        joRes["result"] = res;
    }
    else if (cmd == "inventSetGroupId")
    {
        int grpId = 0;
        if (param.count()>0)
            grpId = param[0].toInt();       //QJsonValue(double, x)，toString()再转会得到0
        invent.setGroupId(grpId);
    }
    else if (cmd == "inventSetScanPeriod")
    {
        int time_ms = 100;
        if (param.count()>0)
        {
            //!注意：param可能是数值字符串，如"200"，用QJsonValue的转换param[0].toInt()返回0，错！，要先转成QString.
            //==>更合理的方式，是前端用parseInt()，确保送来的是数值；但数值是double形式，只能用toInt()转，toString()再转又会得到0
            time_ms = param[0].toInt();
            invent.setScanPeriod(time_ms);
        }
//        joRes["result"] = res;
    }
    else if (cmd == "inventGetScanPeriod")
    {
        QJsonArray dat;
        QJsonObject jo;
        int time_ms = invent.getScanPeriod();
        jo.insert("inventScanPeriod", time_ms);
        dat.append(jo);

        joRes.insert("data", dat);
    }
/*    else if (cmd == "inventGetUnExpCount")
    {
        int grpid, tags, fmttags, lastgrpCnt;
        invent.getUnExportCounts(&grpid, &tags, &fmttags, &lastgrpCnt);
        QJsonArray dat;
        QJsonObject jo;
        jo.insert("lastGroupId", grpid);
        jo.insert("foundTags", tags);
        jo.insert("formatTags", fmttags);
        jo.insert("lastGrpCount", lastgrpCnt);

        dat.append(jo);
        joRes.insert("data", dat);
    }
*/
    return(joRes);
}

QJsonObject URfidWrapper::doTagwrCommand(QString cmd, QJsonArray param)
{
    QJsonObject joRes;
    QJsonObject joDat;
    if (cmd == "tagFindValid")
    {
        bool res = findTagsForWrite(param[0].toBool());
        joRes["result"] = res;
    }
    else if (cmd == "tagWrite")
    {
        if (param.count() >=4)
            joDat  = writeTag(param[0].toInt(), param[1].toString(), param[2].toString(), param[3].toInt());
        else
            joDat  = writeTag(param[0].toInt(), param[1].toString(), param[2].toString());

        if (joDat["result"].toInt() >0)
            joRes["result"] = true;
        else
            joRes["result"] = false;
        QJsonArray dat;
        dat.append(joDat);
        joRes.insert("data", dat);
    }
    else if (cmd == "tagKill")
    {
        joDat = killTag(param[0].toInt());

        if (joDat["result"].toInt() !=0)
            joRes["result"] = true;
        else
            joRes["result"] = false;
        QJsonArray dat;
        dat.append(joDat);
        joRes.insert("data", dat);
    }
    else if (cmd == "tagWriteEpcItem")
    {
        joDat = writeEpcBankWord(param[0].toInt(), param[1].toInt(), param[2].toInt());

        joRes["result"] = (joDat["result"].toInt() >0);
        QJsonArray dat;
        dat.append(joDat);
        joRes.insert("data", dat);
    }
    else if (cmd == "tagBarcodeToEpc")      //这个命令封装了CheckBarcode/EpcEncode
    {
        QString barcode = param[0].toString();
        int fmtId = checkBarcodeValid(barcode);
        joDat.insert("reqTagType", fmtId);

        fmtId = abs(fmtId);
        if (param.count() >1)       //用param[1]指定编码的fmtId, 对应的bit容量>=条码需求的容量，即只能大不能小
        {
            if (param[1].toInt()>0 && param[1].toInt()>=fmtId)
                fmtId = param[1].toInt();
        }
        if (fmtId>0)
        {
            QString epc = epcEncode(barcode, fmtId);
            joDat.insert("epc", epc);
        }
        QJsonArray dat;
        dat.append(joDat);
        joRes.insert("data", dat);
        joRes["result"] = true;
    }
    //
    else if (cmd == "tagCheckBarcode")
    {
        int fmtId = checkBarcodeValid(param[0].toString());

        joRes["result"] = true;
        QJsonArray dat;
        joDat.insert("reqTagType", fmtId);
        dat.append(joDat);
        joRes.insert("data", dat);
    }
    else if (cmd == "tagEpcEncode")
    {
        QString epc;
        if (param.count()>1)
            epc = epcEncode(param[0].toString(),param[1].toInt());
        else
            epc = epcEncode(param[0].toString(), 1);

        joRes["result"] = true;
        QJsonArray dat;
        joDat.insert("epc", epc);
        dat.append(joDat);
        joRes.insert("data", dat);
    }
    return(joRes);
}

QJsonObject URfidWrapper::doMiscCommand(QString cmd, QJsonArray param)
{
    QJsonObject joRes;
    QJsonArray dat;
    QJsonObject jo;
    if (cmd == "miscGetExtMediaPath")
    {
        QString s1 = getExtMediaPath();
        jo.insert("fpath", s1);
        dat.append(jo);
        joRes["result"] = (s1.length()>0);
        joRes.insert("data", dat);
    }
    else if (cmd =="miscSelectLocFiles")
    {
        if (param.count()>=2)
        {
            QString filenames = doSysFileOpenDialog(param[0].toString(), param[1].toString());
            jo.insert("fpath", filenames);
            dat.append(jo);
            joRes["result"] = (filenames.length()>0);
            joRes.insert("data", dat);
        }
        else
            joRes["result"] = false;
    }
    else if (cmd == "miscRunLocFileCommand")
    {
        if (param.count()>=3)
        {
            jo = doSysFileCommand(param[0].toString(), param[1].toString(), param[2].toString());
            dat.append(jo);
            joRes.insert("data", dat);
            joRes["result"] = true;
        }
        else
            joRes["result"] = false;
    }
    else if (cmd == "miscExecDbSql")
    {
        if (param.count()>0)
        {
            QString sqlcmd = param[0].toString();
            QJsonArray param_ar;
            if (param.count()> 1)
            {
                for(int i=1; i<param.count(); i++)
                {
                    param_ar.append(param[i]);
                }
            }
            jo = execDbSql(sqlcmd, param_ar);
            dat.append(jo);
            joRes.insert("data", dat);
            joRes["result"] = true;
        }
        else
            joRes["result"] = false;
    }
    else if (cmd == "miscExportDbRecords")
    {
        if (param.count() >1)
        {
            jo = exportDbRecords(param[0].toInt(), param[1].toString());
            dat.append(jo);
            joRes.insert("data", dat);
            joRes["result"] = true;
        }
        else
            joRes["result"] = false;
    }
    else if (cmd == "miscGetSysConfigs")
    {
//        qDebug()<<"receive miscGetSysConfigs command";
        dat = getSysConfigs();
        joRes.insert("data", dat);
        joRes["result"] = (dat.count()>0);
    }
    else if (cmd == "miscSetSysConfigs")
    {
        int updCnt = setSysConfigs(param);
        jo.insert("updateCount", updCnt);
        dat.append(jo);
        joRes.insert("data", dat);
        joRes["result"] = true;
    }
    else if (cmd == "miscLoadJsonTextFile")     //json & text文件共用, string模式
    {
        QByteArray by = loadJsonTextFile(param[0].toString());
        jo.insert("text", QString(by));
        dat.append(jo);
        joRes.insert("data", dat);
        joRes["result"] = (by.length()>0);
    }
    else if (cmd == "miscSaveToJsonTextFile")       //json & text文件共用
    {
        //string太长会不会出错?
        bool res = saveJsonTextFile(QByteArray(param[0].toString().toLatin1()), param[1].toString());
        joRes["result"] = res;
    }
    return(joRes);
}

void URfidWrapper::sendTagwrRunValue(QJsonObject jo)
{
    QJsonObject joRes;
    joRes["event"] = "tagwrMsg";
    QJsonArray param;
    param.append(jo);
    joRes["param"] = param;

//    emit(onDeviceEvent(joRes));
    emit(deviceEvent(joRes));
}

//-----------------------------------------------------------------------------------------
//      2. 写标签功能
//------------------------------------------------------------

void URfidWrapper::setMiscMessage(QString msg, int level)
{
    miscMessage = msg;

    QMainWindow *mainwin = qobject_cast<QMainWindow*>(this->parent());
    if (mainwin !=nullptr && mainwin->statusBar()!=nullptr && !mainwin->statusBar()->isHidden())
    {
        mainwin->statusBar()->showMessage(msg, 5000);
    }
    QJsonObject jo;
    jo.insert("dbMessage", miscMessage);
    jo.insert("dbMessageLevel", level);
    sendTagwrRunValue(jo);
}

void URfidWrapper::dev_cmdResponse(QString info, int cmd, int status)      //slot
{
    QString s1 = wrProxy.rfidDev->packDumpInfo(0, info, cmd, status);
    if (s1 == info)
    {
        setMiscMessage(s1, 0);
    }
}

void URfidWrapper::dev_errMsg(QString info, int errCode)       //slot
{
    QString s1 = wrProxy.rfidDev->packDumpInfo(1, info, errCode, 0);
    if (s1 ==info)
    {
        setMiscMessage(s1, 1);
    }
}

void URfidWrapper::dev_readMemBank(Membank_data_t bankdat, int info)   //slot
{
    Q_UNUSED(bankdat);
    Q_UNUSED(info);
#if 0
    if (bankdat.bankId == Membank_EPC)
    {
        QString s1;
        s1 = "read EPC:" + QByteArray((const char *)bankdat.EPC, bankdat.EpcSize).toHex();   //+":\n";
        s1 = s1 + QString(" Bank:%1,Len:%2,Begin:%3-").arg(bankdat.bankId).arg(bankdat.len).arg(bankdat.hot_offset);
        s1 = s1 + QByteArray((const char *)(&bankdat.dats[bankdat.hot_offset]), bankdat.len).toHex();   // + "\n";
        qDebug()<<s1;
    }
#endif
}

int URfidWrapper::checkBarcodeValid(QString barcode)
{
    if (barcode != barcode.simplified())
        return(0);
    QByteArray bybarcode = QByteArray(barcode.toLatin1());
    int res = srcformat.barcodeCheck(bybarcode);
    if (wrProxy.dbstore != NULL)
    {
        //条码重复
        int usedCount = wrProxy.dbstore->usedItemIdentifer(bybarcode);
        if (usedCount !=0)
            res = -res;
    }
    return(res);
}

QString URfidWrapper::epcEncode(QString barcode, int barcodeType)
{
    QString res = "";
    QByteArray bar = QByteArray(barcode.toUtf8());      //source是ascii， toLatin1()也可
    uint8_t enc_code[MAX_EPC_BYTES] = {0};
    int len = srcformat.EpcEncode(bar, enc_code, barcodeType);
    if (len<4)
        return(res);
    res = QByteArray((const char *)enc_code, len).toHex();
    return(res);
}

bool URfidWrapper::openURfidWritor(int inventMode, bool useLocalDb)
{
    Q_UNUSED(inventMode);

    QString prompt = "";
    bool res = true;

    res = wrProxy.openWritor(prompt);
    rfidDev = wrProxy.rfidDev;
    invent.rfidDev = rfidDev;
    if (useLocalDb)
    {
        wrProxy.dbstore = &dbstore;
        invent.dbstore = &dbstore;
    }
    if (!inventMode)
    {
        wrProxy.startWritor();
        _inventMode = false;
    }
    else
    {
        invent.initInterrogator();      //这里要用到dbstore了
        _inventMode = true;
    }

    if (rfidDev != NULL)
    {
        connect(rfidDev, SIGNAL(cmdResponse(QString, int, int)), this, SLOT(dev_cmdResponse(QString, int, int)), Qt::QueuedConnection);
        connect(rfidDev, SIGNAL(errorResponse(QString, int)), this, SLOT(dev_errMsg(QString, int)), Qt::QueuedConnection);
        connect(rfidDev, SIGNAL(readMemBank(Membank_data_t, int)), this, SLOT(dev_readMemBank(Membank_data_t, int)), Qt::QueuedConnection);

        if (!inventMode)
            connect(rfidDev, SIGNAL(tagIdentify(IdentifyEPC_t,int)), this, SLOT(onReadTagPoolUpdate(IdentifyEPC_t,int)),Qt::QueuedConnection);
        else
            connect(rfidDev, SIGNAL(tagIdentify(IdentifyEPC_t,int)), &invent, SLOT(onTagIdentified(IdentifyEPC_t,int)),Qt::QueuedConnection);
        connect(&wrProxy, SIGNAL(scanTick(int,int)), this, SLOT(onReadTagTick(int,int)),Qt::QueuedConnection);

        connect(&invent, SIGNAL(ScanTickAck(int)), this, SLOT(onInventTickAck(int)), Qt::QueuedConnection);
        connect(&invent, SIGNAL(ChangeScanMode(int)), this, SLOT(onInventChangeMode(int)), Qt::QueuedConnection);
        connect(&invent, SIGNAL(InventUpdate(QByteArray, InventifyRecord_t*, bool)),
                this, SLOT(onInventUpdate(QByteArray, InventifyRecord_t*, bool)), Qt::QueuedConnection);
    }
    wrProxy.loadRecordsDb();        //不使用dbstore也要空WritedRec, KillRec
    wrProxy.loadJsonConfig();

/*#
    QJsonObject jo;
    jo.insert("writedCount", wrProxy.writeRec.dailyCount);
    jo.insert("killCount", wrProxy.killAuxRec.dailyCount);
    sendTagwrRunValue(jo);
*/
    QSettings* ini = new QSettings("./config.ini",QSettings::IniFormat);
    QString s1 = ini->value("/Operator/OperatorName").toString();
    wrProxy.writeRec.operatorName = s1;
    wrProxy.killAuxRec.operatorName = s1;
//    qDebug()<<"operator name:"<<s1;

    if (res)
    {
        QString s1 = ((Dev_R200 *)(rfidDev))->getModuleHwInfo();
        setMiscMessage(s1, 0);
    }
    else
        setMiscMessage(prompt, 1);
    return(res);
}

bool URfidWrapper::setInventifyMode(bool inventMode)
{
    if (_inventMode == inventMode)
        return(true);
    if (rfidDev == NULL)
    {
//        qDebug()<<"err :no device";
        return(false);
    }
    if (wrProxy.identifyRuning || wrProxy.writingLock || invent.scanRuning)
    {
//        qDebug()<<"err, modes:"<<wrProxy.identifyRuning<<wrProxy.writingLock<<invent.scanRuning;
        return(false);
    }

    if (!inventMode)
    {
        wrProxy.startWritor();
        disconnect(rfidDev, SIGNAL(tagIdentify(IdentifyEPC_t,int)), &invent, SLOT(onTagIdentified(IdentifyEPC_t,int)));
        connect(rfidDev, SIGNAL(tagIdentify(IdentifyEPC_t,int)), this,
                SLOT(onReadTagPoolUpdate(IdentifyEPC_t,int)),Qt::QueuedConnection);
    }
    else
    {
        invent.initInterrogator();
        disconnect(rfidDev, SIGNAL(tagIdentify(IdentifyEPC_t,int)), this, SLOT(onReadTagPoolUpdate(IdentifyEPC_t,int)));
        connect(rfidDev, SIGNAL(tagIdentify(IdentifyEPC_t,int)), &invent,
                SLOT(onTagIdentified(IdentifyEPC_t,int)),Qt::QueuedConnection);
    }
    _inventMode = inventMode;
    return(true);
}

bool URfidWrapper::findTagsForWrite(bool start)
{
    if ((start == wrProxy.identifyRuning) || wrProxy.writingLock)
        return(false);
    if (start)
    {
        if (!wrProxy.writingLock && !wrProxy.identifyRuning)
        {
            wrProxy.identifyRun(true);
        }
        else
            return(false);
    }
    else
    {
        if (wrProxy.identifyRuning && wrProxy.scanTickCount >5)
            wrProxy.identifyRun(false);
        else
            return(false);
    }
    return(true);
}

///
/// \brief RfidWrite::dev_tagIdentify (写模式)识别到标签后的处理
/// \param tagEpc
/// \param infoSerial
///
void URfidWrapper::onReadTagPoolUpdate(IdentifyEPC_t tagEpc, int infoSerial)   //slot
{
    Q_UNUSED(infoSerial);

    if (wrProxy.identifyRuning && !wrProxy.writingLock)
    {
        int prevCnt = wrProxy.identifyPool.count();
        int hotid = wrProxy.pushIdentifyEpc(tagEpc, infoSerial);
        //
        QJsonObject jo;
        jo["id"] = hotid;
        jo["hitCount"] = wrProxy.identifyPool[hotid].hitCount;
        if (hotid >= prevCnt)
        {
            //新加入
            jo["rdmask"] = wrProxy.identifyPool[hotid].getInherents;
            QString s1 = QByteArray((const char *)wrProxy.identifyPool.at(hotid).EPC,wrProxy.identifyPool.at(hotid).epcSize).toHex();
            jo["epc"] = s1;
            jo["epcSize"] = wrProxy.identifyPool.at(hotid).tagEpcSize;      //这个项不够严谨，应该直接导出EPC.PC
            jo["epcPC"] = QString("%1H").arg(wrProxy.identifyPool.at(hotid).EPC_PC, 0, 16);

            int fmtid = wrProxy.identifyPool.at(hotid).formatId;
            if (fmtid>=0)
            {
                s1 = QString::fromLatin1((const char *)wrProxy.identifyPool.at(hotid).itemIdentifier);
                jo["barcode"] = s1;
            }
            jo["fmtId"] = fmtid;
            jo["securityBit"] = wrProxy.identifyPool.at(hotid).securityBit;
            //
        }        
        QJsonObject joRes;
        joRes["event"] = "findTagUpdate";       //即使不是新增，改写了hitCount也要显示
        QJsonArray param;
        param.append(jo);
        joRes["param"] = param;
//        emit(onDeviceEvent(joRes));
        emit(deviceEvent(joRes));
        //
    }
}


///
/// \brief RfidWrite::on_IdentifyScan 扫描识别定时器tick响应 (after, tick中readInherent之后)
/// \param count
///
void URfidWrapper::onReadTagTick(int count, int updId)      //slot
{
    //读出了tid-serialNo
    if (updId >=0)
    {
        QJsonObject jo;
        jo["id"] = updId;
        jo["hitCount"] = wrProxy.identifyPool[updId].hitCount;
        int8_t rdmask = wrProxy.identifyPool[updId].getInherents;
        QString s1;
        jo["rdmask"] = rdmask;
        if (rdmask & GET_INHERENT_SERIALNO)
        {
            s1 = QByteArray((const char *)wrProxy.identifyPool.at(updId).tidSerialNo, SERIALNO_BYTES).toHex();
                jo["serialNo"] = s1;
        }
        if (rdmask & GET_INHERENT_RFUPWD)
        {
            s1 = QByteArray((const char *)wrProxy.identifyPool.at(updId).accessPwd, PASSWD_BYTES).toHex();
            jo["accessPwd"] = s1;
            s1 = QByteArray((const char *)wrProxy.identifyPool.at(updId).killPwd, PASSWD_BYTES).toHex();
            jo["killPwd"] = s1;
        }
        QJsonObject joRes;
        joRes["event"] = "findTagUpdate";
        QJsonArray param;
        param.append(jo);
        joRes["param"] = param;
//        emit(onDeviceEvent(joRes));
        emit(deviceEvent(joRes));
    }
    //显示扫描次数和停止处理
    QJsonObject jmsg;
    if (wrProxy.identifyRuning)
    {
        bool stopFind = false;
        if (count >=50 && updId <0)     //停止条件-A： 扫描次数超过50次
            stopFind = true;
        else
        {
            //停止条件-B: 找到了空白标签
            //停止条件-C: 没有发现新标签，某些标签被重复找到20次，停止识别。
            //  identifyRounds不是扫描次数，是发现标签次数，在pushIdentifyEpc()中update,有时1个tick可能有多次identifyRounds++
            int valid_id = wrProxy.getValidTagsIndex();
            if ((valid_id >=0  && valid_id==updId)     //停止条件-B
                    || (wrProxy.identifyRounds>=15))   //停止条件-C
            {
                stopFind = true;
            }
        }
        if (stopFind)
        {
            wrProxy.identifyRun(false);
            jmsg.insert("findTagTick", -1);
        }
        else
        {
            jmsg.insert("findTagTick", count);
        }
        sendTagwrRunValue(jmsg);
    }

    //附加处理
    if (wrProxy.rfidDev->m_WaitAckTxCount >50)
    {
        //读写模块长时间没有响应
        if (wrProxy.rfidDev->moduleType == RfidReaderMod::UHF_READER_R200)
        {
            ((Dev_R200 *)(wrProxy.rfidDev))->resetDevice();
            jmsg.insert("findTagTick", -2);
            sendTagwrRunValue(jmsg);
        }
    }
}

QJsonObject URfidWrapper::writeTag(int poolId, QString context, QString epcHex, int usrBankSelect)
{
    Q_UNUSED(usrBankSelect);
    QJsonObject joRes;
    joRes["result"] = 0;

    if (wrProxy.identifyRuning || wrProxy.writingLock)
        return(joRes);
    if (poolId<0 || poolId>= wrProxy.identifyPool.count())
        return(joRes);
    QByteArray epc;
    if (epcHex.length()==0 && context.length()>0)
    {
        uint8_t enc_code[MAX_EPC_BYTES] = {0};
        int len = srcformat.EpcEncode(QByteArray(context.toUtf8()), enc_code);  //用条码按格式编码
        epc = QByteArray((const char *)enc_code, len);
    }
    else
    {
        epc = QByteArray::fromHex(epcHex.toUtf8());     //直接用编好的EPC
        //if barcode.length==0, decode from epc....
    }
    if (epc.length()<4 || epc.length()>wrProxy.identifyPool[poolId].tagEpcSize)
        return(joRes);

    int res = wrProxy.writeAppDats(poolId, (uint8_t *)epc.constData(), epc.length(),
                srcformat.usrBankDats, srcformat.usrBankDatSize);

    joRes["result"] = res;
    if (res ==WRITE_STEP_ALL)
    {
        bool update = false;
        wrProxy.modifyPoolTagEPC(poolId, (uint8_t *)epc.constData(), epc.length());
        if (wrProxy.dbstore != NULL)
        {
            //存入数据库
            wrProxy.writeRec.itemIdentifier = QByteArray(context.toUtf8());
            wrProxy.writeRec.EPC = epc;
            wrProxy.writeRec.epcBytes = epc.length();
            wrProxy.writeRec.tagSerialNo.setRawData((const char *)wrProxy.identifyPool.at(poolId).tidSerialNo, SERIALNO_BYTES);
            update = wrProxy.dbstore->usedTagSerialNo(wrProxy.writeRec.tagSerialNo);
            wrProxy.dbstore->saveTagRecord(wrProxy.writeRec, update);
        }
        else
        {
            wrProxy.writeRec.dailyCount++;
        }

        QString s1;
        s1 = epc.toHex();
        joRes["epc"] = s1;
        joRes["context"] = context;
        joRes["wrCount"] = wrProxy.writeRec.dailyCount;
        s1 = QByteArray((const char *)wrProxy.identifyPool.at(poolId).tidSerialNo, SERIALNO_BYTES).toHex();
        joRes["tagSerial"] = s1;
        if (wrProxy.cfg_writeUserBank && srcformat.usrBankDats != NULL && srcformat.usrBankDatSize>0)
            joRes["writeUsrBank"] = true;
        else
            joRes["writeUsrBank"] = false;
        if (wrProxy.cfg_setLocker && wrProxy.cfg_lockOpt>=LOCK_SECURE_ACCESS)
            joRes["setLocker"] = true;
        else
            joRes["setLocker"] = false;
//        joRes["isUpdate"] = update;         //2021-11-9增加

        //更新<查找标签表>的显示
        QJsonObject jo;
        jo["id"] = poolId;
        jo["rdmask"] = wrProxy.identifyPool[poolId].getInherents;    //0x0f -新写
        s1 = epc.toHex();
        jo["epc"] = s1;
        jo["barcode"] = QString::fromLatin1((const char *)wrProxy.identifyPool.at(poolId).itemIdentifier);

        s1 = QByteArray((const char *)wrProxy.identifyPool.at(poolId).accessPwd, PASSWD_BYTES).toHex();
        jo["accessPwd"] = s1;
        s1 = QByteArray((const char *)wrProxy.identifyPool.at(poolId).killPwd, PASSWD_BYTES).toHex();
        jo["killPwd"] = s1;

        QJsonObject joRes2;
        joRes2["event"] = "findTagUpdate";
        QJsonArray param;
        param.append(jo);
        joRes2["param"] = param;
//        emit(onDeviceEvent(joRes2));
        emit(deviceEvent(joRes2));
    }
    return(joRes);
}

QJsonObject URfidWrapper::killTag(int poolId)
{
    QJsonObject joRes;
    joRes["result"] = 0;

    if (wrProxy.identifyRuning || wrProxy.writingLock || poolId<0 || poolId>= wrProxy.identifyPool.count())
        return(joRes);
    if (wrProxy.identifyPool.at(poolId).getInherents ==0)       //<GET_INHERENT_ALL ?
        return(joRes);

    int res = wrProxy.killATag(poolId);
    if (res <0)
        return(joRes);
    joRes["result"] = 1;

    //save to dbase, display in tableview..
    int epcLen = wrProxy.identifyPool.at(poolId).epcSize;
    int barstrLen = strlen((const char *)wrProxy.identifyPool.at(poolId).itemIdentifier);
    if (wrProxy.dbstore != NULL)
    {
        wrProxy.killAuxRec.aVersion = 0x40;
        wrProxy.killAuxRec.epcBytes = epcLen;
        wrProxy.killAuxRec.EPC.setRawData((const char *)wrProxy.identifyPool.at(poolId).EPC, epcLen);
        wrProxy.killAuxRec.tagSerialNo.setRawData((const char *)wrProxy.identifyPool.at(poolId).tidSerialNo, SERIALNO_BYTES);
        wrProxy.killAuxRec.itemIdentifier.setRawData((const char *)wrProxy.identifyPool.at(poolId).itemIdentifier,barstrLen);
        wrProxy.killAuxRec.remark = "Kill Tag";
        if (wrProxy.dbstore->saveTagRecord(wrProxy.killAuxRec, false))
        {
            wrProxy.dbstore->updateTagForKill(QByteArray((const char *)wrProxy.identifyPool.at(poolId).tidSerialNo, SERIALNO_BYTES));
        }
    }
    else
    {
        wrProxy.killAuxRec.dailyCount++;
    }
    //
    QString s1 = QByteArray((const char *)wrProxy.identifyPool.at(poolId).EPC, epcLen).toHex();
    joRes["epc"] = s1;
    joRes["context"] = QString::fromLatin1((const char *)wrProxy.identifyPool.at(poolId).itemIdentifier, barstrLen);
    s1 = QByteArray((const char *)wrProxy.identifyPool.at(poolId).tidSerialNo, SERIALNO_BYTES).toHex();
    joRes["tagSerial"] = s1;
    joRes["killCount"] = wrProxy.killAuxRec.dailyCount;

    return(joRes);
}

QJsonObject URfidWrapper::writeEpcBankWord(int poolId, int item_oid, int value)
{  
    QJsonObject joRes;
    uint8_t newEpc[MAX_EPC_BYTES] = {   0x00    };
    int epcLen = wrProxy.identifyPool.at(poolId).epcSize;

    //item_oid是EPC格式标准中定义的项，特别的,-1作为改写EPCbank.PC字，用来恢复PC中的标签容量定义
    int res = wrProxy.writeEpcItemBits(poolId, item_oid, value, newEpc);
    joRes["result"] = res;
    if (res <=0)
        return(joRes);
    if (item_oid <0)
        return(joRes);

    int barstrLen = strlen((const char *)wrProxy.identifyPool.at(poolId).itemIdentifier);
    if (wrProxy.dbstore != NULL)
    {
        //存入数据库
        wrProxy.writeRec.itemIdentifier.setRawData((const char *)wrProxy.identifyPool.at(poolId).itemIdentifier,barstrLen);
        wrProxy.writeRec.EPC = QByteArray((char *)newEpc, epcLen).toHex();
        wrProxy.writeRec.epcBytes = epcLen;
        wrProxy.writeRec.tagSerialNo.setRawData((const char *)wrProxy.identifyPool.at(poolId).tidSerialNo, SERIALNO_BYTES);
        bool update = wrProxy.dbstore->usedTagSerialNo(wrProxy.writeRec.tagSerialNo);
        wrProxy.dbstore->saveTagRecord(wrProxy.writeRec, update);
    }
    else
    {
        wrProxy.writeRec.dailyCount++;
    }
    //构造用于显示的writeEvent记录，与writeTags同样处理
    QString s1 = QByteArray((char *)newEpc, epcLen).toHex();
    joRes["epc"] = s1;
    joRes["context"] = QString::fromLatin1((const char *)wrProxy.identifyPool.at(poolId).itemIdentifier, barstrLen);
    s1 = QByteArray((const char *)wrProxy.identifyPool.at(poolId).tidSerialNo, SERIALNO_BYTES).toHex();
    joRes["tagSerial"] = s1;
    joRes["wrCount"] = wrProxy.writeRec.dailyCount;

    return(joRes);
}

//-----------------------------------------------------------------------------------------
//      3. 标签盘点功能
//------------------------------------------------------------
void URfidWrapper::onInventChangeMode(int mode)
{
    QJsonObject joRes;
    joRes["event"] = "inventMsg";
    QJsonArray param;
    QJsonObject jo;
    jo.insert("scanMultiHit", mode);        //1- multiHit, 0 -single report
    param.append(jo);
    joRes["param"] = param;

//    emit(onDeviceEvent(joRes));
    emit(deviceEvent(joRes));
}

void URfidWrapper::onInventTickAck(int para)
{
    if (para <=0)
    {
        _inventScanTick = -para;
    }

    QJsonObject joRes;
    joRes["event"] = "inventMsg";
    QJsonArray param;
    QJsonObject jo;
    jo.insert("scanTick", _inventScanTick);
    param.append(jo);
    joRes["param"] = param;

//    emit(onDeviceEvent(joRes));
    emit(deviceEvent(joRes));
}


void URfidWrapper::onInventUpdate(QByteArray epc, InventifyRecord_t* pRec, bool isNew)
{
//    qDebug()<<"Invent Update:"<<epc.toHex();
    QJsonObject jo;
    QString s1;
    jo["append"] = isNew;
    jo["id"] = pRec->id;
    s1 = epc.toHex();
    jo["epc"] = s1;
    jo["hitCount"] = pRec->hitCount;
/*    if (pRec->hitTimeElapsed<1000)
    {
        s1 = QString("0.%1").arg(pRec->hitTimeElapsed/10);
    }
    else
    {
        int r1 = (pRec->hitTimeElapsed % 1000)/100;
        s1 = QString("%1.%2").arg(pRec->hitTimeElapsed/1000).arg(r1);
    }
    jo["hitTime"] = s1;
*/
    jo["hitTime"] = (int)(pRec->hitTimeElapsed/100);
    jo["formatId"] = pRec->formatId;    //
    jo["modversion"] = pRec->modeVersion;
    jo["groupId"] = pRec->groupIdA;
//#    jo["rssi"] = pRec->rssi_max;
    jo["rssi"] = pRec->rssi;
    jo["context"] = QString::fromLatin1(pRec->identifier);
    if (isNew)
    {
        jo["title"] ="";            //书名，待扩展
        if (pRec->formatId >=0)
        {
            jo["securityBit"] = QString::number(pRec->securityBit);
        }
    }

    QJsonObject joRes;
    QJsonArray param;
    param.append(jo);

    joRes["event"] = "inventTagCapture";
    joRes["param"] = param;
//    emit(onDeviceEvent(joRes));
    emit(deviceEvent(joRes));
}

