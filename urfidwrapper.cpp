#include "urfidwrapper.h"
#include <QDebug>
//#include <QCoreApplication>
#include <QMainWindow>
#include <QStatusBar>
#include "containerwindow.h"

URfidWrapper::URfidWrapper(QObject *parent) : QObject(parent),
    wrProxy(this), invent(this)
{
    //QMetatype注册
    qRegisterMetaType<IdentifyEPC_t>("IdentifyEPC_t");
    qRegisterMetaType<Membank_data_t>("Membank_data_t");
    qRegisterMetaType<InventifyRecord_t>("InventifyRecord_t");

    wrProxy.srcdatFmt = &srcformat;
}

URfidWrapper::~URfidWrapper()
{
    invent.rfidDev = NULL;      //欺骗一下invent类，避免重复delete rfidDev
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
    if (!inventMode)
    {
        wrProxy.startWritor();
    }
    else
    {
        invent.initInterrogator();
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

    if (useLocalDb)
    {
        wrProxy.dbstore = &dbstore;
        invent.dbstore = &dbstore;
    }
    wrProxy.loadRecordsDb();        //不使用dbstore也要空WritedRec, KillRec
    emit writedCountChanged();
    wrProxy.loadJsonConfig();

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
//        qDebug()<<"fault, no rfidDev";
        return(false);
    }
    if (wrProxy.identifyRuning || wrProxy.writingLock || invent.scanRuning)
    {
//        qDebug()<<"fault, rfidDev busy";
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

        if (invent.m_unExportCount !=0) {
            emit(inventScanChanged());
        }
    }
    _inventMode = inventMode;
    return(true);
}


bool URfidWrapper::findTagsForWrite(bool start)       //slot ?
{
    if ((start == wrProxy.identifyRuning) || wrProxy.writingLock)
        return(false);
    if (start)
    {
        if (!wrProxy.writingLock && !wrProxy.identifyRuning)
            wrProxy.identifyRun(true);
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


void URfidWrapper::setMiscMessage(QString msg, int level)
{
    miscMessage = msg;

    QMainWindow *mainwin = qobject_cast<QMainWindow*>(this->parent());
    if (mainwin !=nullptr && mainwin->statusBar()!=nullptr && !mainwin->statusBar()->isHidden())
    {
        mainwin->statusBar()->showMessage(msg, 5000);
    }
    emit promptMessageUpdate(level);

}

void URfidWrapper::dev_cmdResponse(QString info, int cmd, int status)      //slot
{
    QString s1 = wrProxy.rfidDev->packDumpInfo(0, info, cmd, status);
    setMiscMessage(s1, 0);
    if (s1 == info)         //普通信息包装后只在状态栏显示，要debug输出，则在packDumpInfo()中不作包装
        qDebug()<<info.toLatin1();
}

void URfidWrapper::dev_errMsg(QString info, int errCode)       //slot
{
    QString s1 = wrProxy.rfidDev->packDumpInfo(1, info, errCode, 0);
    setMiscMessage(s1, 1);
    if (s1 ==info)
        qDebug()<<info;
}

void URfidWrapper::dev_readMemBank(Membank_data_t bankdat, int info)   //slot
{
    Q_UNUSED(info);
#if 0
    QString s1;
    s1 = "read EPC:" + QByteArray((const char *)bankdat.EPC, bankdat.EpcSize).toHex();   //+":\n";
    s1 = s1 + QString(" Bank:%1,Len:%2,Begin:%3-").arg(bankdat.bankId).arg(bankdat.len).arg(bankdat.hot_offset);
    s1 = s1 + QByteArray((const char *)(&bankdat.dats[bankdat.hot_offset]), bankdat.len).toHex();   // + "\n";
    qDebug()<<s1;
#endif
    if (wrProxy.writingLock && wrProxy.reqVerity_PoolId>=0)
    {
        wrProxy.doVerity(bankdat);
    }
    //emit();
}

///
/// \brief RfidWrite::dev_tagIdentify 识别到标签后的处理
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
        if (hotid>=0)
        {
            int valid_id = wrProxy.getValidTagsIndex();
            if ((valid_id >=0  && valid_id==hotid)|| wrProxy.identifyRounds>=20)
            {
                //自动停止识别
                wrProxy.identifyRun(false);
                emit findTagTick(-1);
            }
        }
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

//            qDebug()<<"--readed:"<<wrProxy.identifyPool[hotid].getInherents;
        }
        emit findTagUpdate(jo);
    }
}


///
/// \brief RfidWrite::on_IdentifyScan 扫描识别定时器tick响应 (after, tick中readInherent之后)
/// \param count
///
void URfidWrapper::onReadTagTick(int count, int updId)      //slot
{
    if (wrProxy.identifyRuning)
    {
        if (count >=50 || reqForWrite)
        {
            wrProxy.identifyRun(false);
            reqForWrite = false;
            emit findTagTick(-1);
        }
        else
        {
            emit findTagTick(count);
        }
    }
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
//            if (!arrayZero(wrProxy.identifyPool.at(updId).tidSerialNo, SERIALNO_BYTES))
                jo["serialNo"] = s1;
        }
        if (rdmask & GET_INHERENT_RFUPWD)
        {
            s1 = QByteArray((const char *)wrProxy.identifyPool.at(updId).accessPwd, PASSWD_BYTES).toHex();
            jo["accessPwd"] = s1;
            s1 = QByteArray((const char *)wrProxy.identifyPool.at(updId).killPwd, PASSWD_BYTES).toHex();
            jo["killPwd"] = s1;
        }
        emit findTagUpdate(jo);
    }
    //
    if (wrProxy.rfidDev->m_WaitAckTxCount >50)
    {
        //读写模块长时间没有响应
        if (wrProxy.rfidDev->moduleType == RfidReaderMod::UHF_READER_R200)
        {
            ((Dev_R200 *)(wrProxy.rfidDev))->resetDevice();
            emit findTagTick(-2);
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
        int len = srcformat.EpcEncode(QByteArray(context.toUtf8()), enc_code);
        epc = QByteArray((const char *)enc_code, len).toHex();
    }
    else
    {
        epc = QByteArray::fromHex(epcHex.toUtf8());
        //if barcode.length==0, decode from epc....
    }
    if (epc.length()<4 || epc.length()>wrProxy.identifyPool[poolId].tagEpcSize)
        return(joRes);

    int res = wrProxy.writeAppDats(poolId, (uint8_t *)epc.constData(), epc.length(),
                srcformat.usrBankDats, srcformat.usrBankDatSize);

    joRes["result"] = res;
    if (res ==WRITE_STEP_ALL)
    {
        wrProxy.modifyPoolTagEPC(poolId, (uint8_t *)epc.constData(), epc.length());
        if (wrProxy.dbstore != NULL)
        {
            //存入数据库并刷新已写TableView显示
            wrProxy.writeRec.itemIdentifier = QByteArray(context.toUtf8());
            wrProxy.writeRec.EPC = epc;
            wrProxy.writeRec.epcBytes = epc.length();
            wrProxy.writeRec.tagSerialNo.setRawData((const char *)wrProxy.identifyPool.at(poolId).tidSerialNo, SERIALNO_BYTES);
            bool update = wrProxy.dbstore->usedTagSerialNo(wrProxy.writeRec.tagSerialNo);
            wrProxy.dbstore->saveTagRecord(wrProxy.writeRec, update);
        }
        else
        {
            wrProxy.writeRec.dailyCount++;
        }

        joRes["epc"] = epcHex;
        joRes["context"] = context;
        joRes["wrCount"] = wrProxy.writeRec.dailyCount;
        QString s1 = QByteArray((const char *)wrProxy.identifyPool.at(poolId).tidSerialNo, SERIALNO_BYTES).toHex();
        joRes["tagSerial"] = s1;
        if (wrProxy.cfg_writeUserBank && srcformat.usrBankDats != NULL && srcformat.usrBankDatSize>0)
            joRes["writeUsrBank"] = true;
        else
            joRes["writeUsrBank"] = false;
        if (wrProxy.cfg_setLocker && wrProxy.cfg_lockOpt>=LOCK_SECURE_ACCESS)
            joRes["setLocker"] = true;
        else
            joRes["setLocker"] = false;

        //更新<查找标签表>的显示
        QJsonObject jo;
        jo["id"] = poolId;
        jo["rdmask"] = wrProxy.identifyPool[poolId].getInherents;    //0x0f -新写
        jo["epc"] = epcHex;
        jo["barcode"] = QString::fromLatin1((const char *)wrProxy.identifyPool.at(poolId).itemIdentifier);

        s1 = QByteArray((const char *)wrProxy.identifyPool.at(poolId).accessPwd, PASSWD_BYTES).toHex();
        jo["accessPwd"] = s1;
        s1 = QByteArray((const char *)wrProxy.identifyPool.at(poolId).killPwd, PASSWD_BYTES).toHex();
        jo["killPwd"] = s1;

        emit findTagUpdate(jo);

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
//        wrProxy.killAuxRec.remark = "标签灭活";
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

bool URfidWrapper::runInvent(bool startRun, int scanMode)
{
    if (startRun)
    {
        if (invent.scanRuning && _inventScanTick <5)     //防止button粘连
            return(false);
        _inventScanTick = 0;
    }
    return(invent.runInventify(startRun, scanMode));
}

void URfidWrapper::toggleInventMode()
{
    if (invent.scanRuning && invent.req_chgScanMode==0)
    {
        invent.req_chgScanMode = 1;
    }
}

void URfidWrapper::inventResetLet(bool clearAll)
{
    if (!invent.scanRuning)
    {
        if (clearAll)
        {
            dbstore.markInventsDiscard();
        }
        invent.inventClear(!clearAll);
    }
}

void URfidWrapper::onInventChangeMode(int mode)
{
//    qDebug()<<"multHitMode:"<<mode;
    emit(inventScanModeUpdate((mode!=0)));
}

void URfidWrapper::onInventTickAck(int para)
{
    if (para <=0)
    {
        _inventScanTick = -para;
    }
    emit(inventScanChanged());
}

void URfidWrapper::onInventUpdate(QByteArray epc, InventifyRecord_t* pRec, bool isNew)
{
    QJsonObject jo;
    QString s1;
    jo["append"] = isNew;
    jo["id"] = pRec->id;
    s1 = epc.toHex();
    jo["epc"] = s1;
    jo["hitCount"] = pRec->hitCount;
    if (pRec->hitTimeElapsed<1000)
    {
        s1 = QString(".%1").arg(pRec->hitTimeElapsed/10);
    }
    else
    {
        int r1 = (pRec->hitTimeElapsed % 1000)/100;
        s1 = QString("%1.%2").arg(pRec->hitTimeElapsed/1000).arg(r1);
    }
    jo["hitTime"] = s1;
    if (!isNew)
    {
        emit(inventTagUpdate(jo));
        return;
    }

    //
    jo["context"] = QString::fromLatin1(pRec->identifier);
    jo["title"] ="";            //书名，待扩展
    if (pRec->formatId ==0)
        s1 = "标准";
    else
        s1 = srcformat.getFormatTitle(pRec->formatId);
    jo["formatId"] = s1;
    if (pRec->formatId >=0)
        jo["securityBit"] = QString::number(pRec->securityBit);
    jo["groupId"] = pRec->groupIdA;
    emit(inventTagUpdate(jo));
}

void URfidWrapper::setInventScanPeriod(int time_ms)
{
    if (!invent.scanRuning && time_ms != invent.scanIntfTime)
    {
        invent.scanIntfTime = time_ms;
        invent.ini->setValue("/Invent/scanIntfTime", time_ms);      //随时保存
    }
}

#if 0
void URfidWrapper::showSysToolbar(int autoHideTime)
{
    ContainerWindow *mainwin = qobject_cast<ContainerWindow*>(this->parent());
//    if (mainwin !=nullptr)
    mainwin->naviToolBar->setAutoShow(autoHideTime);
}
#endif

void URfidWrapper::sysClose()
{
    if (wrProxy.identifyRuning)
        wrProxy.identifyRun(false);
    if (invent.scanRuning)
        invent.runInventify(false);

    ContainerWindow *mainwin = qobject_cast<ContainerWindow*>(this->parent());
    mainwin->loadEmptyView();
    mainwin->close();
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

