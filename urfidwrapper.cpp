#include "urfidwrapper.h"
#include <QDebug>
#include <QMainWindow>
#include <QStatusBar>
#include "containerwindow.h"
#include <QFileDialog>
#include <QHostInfo>

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
//    setMiscMessage(s1, 0);
    if (s1 == info)
    {
        setMiscMessage(s1, 0);
//        qDebug()<<info.toLatin1();
    }
}

void URfidWrapper::dev_errMsg(QString info, int errCode)       //slot
{
    QString s1 = wrProxy.rfidDev->packDumpInfo(1, info, errCode, 0);
//    setMiscMessage(s1, 1);
    if (s1 ==info)
    {
        setMiscMessage(s1, 1);
//        qDebug()<<info;
    }
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

    QSettings* ini = new QSettings("./config.ini",QSettings::IniFormat);
    QString s1 = ini->value("/Operator/OperatorName").toString();
    wrProxy.writeRec.operatorName = s1;
    wrProxy.killAuxRec.operatorName = s1;

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
        return(false);
    }
    if (wrProxy.identifyRuning || wrProxy.writingLock || invent.scanRuning)
    {
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


bool URfidWrapper::findTagsForWrite(bool start)
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

void URfidWrapper::inventResetLet(bool discard)
{
    if (!invent.scanRuning)
    {
        if (discard)
        {
            dbstore.markInventsDiscard();
        }
        invent.inventClear(!discard);
    }
}

void URfidWrapper::onInventChangeMode(int mode)
{
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

//=========================== 扩展功能 ============================================================

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
    if (tabSelect !=0)
    {
        res = dbstore.exportToCsv(mfilename, tabSelect-1);
    }
    else
    {
        res = dbstore.inventExport2csv(mfilename);
    }
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
    if (tabSelect !=0)
    {
        if (tabSelect ==1)
            wrProxy.writeRec.dailyCount = 0;
        else if (tabSelect ==3)
            wrProxy.killAuxRec.dailyCount = 0;
        emit writedCountChanged();
    }
    else
    {
        invent.inventClear(false);
        _inventScanTick = 0;
        emit(inventScanChanged());
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
    jRow["name"] = "下载升级";
    jRow["editor"] = "text";
    jRow["value"] = "";
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
        else if (idname == "下载升级")
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
    if ((reqUpdUrl == "file://" + fpath)&& fpath.length()>0)
    {
        system("./cpupdfile.sh");
        updCnt++;
    }

    return(updCnt);
}
