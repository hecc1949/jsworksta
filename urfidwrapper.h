#ifndef URfidWrapper_H
#define URfidWrapper_H

#include <QObject>
#include <QJsonObject>
/*
#include "urfidLib/srcdatformat.h"
#include "urfidLib/writebooktags.h"
#include "urfidLib/dbstore.h"
#include "urfidLib/inventproxy.h"
*/
#include "srcdatformat.h"
#include "writebooktags.h"
#include "dbstore.h"
#include "inventproxy.h"

class URfidWrapper : public QObject
{
    Q_OBJECT
    Q_PROPERTY(int writedCount READ getWritedCount NOTIFY writedCountChanged)
    Q_PROPERTY(int killCount READ getKillCount NOTIFY writedCountChanged)
    Q_PROPERTY(QString promptMessage READ getpromptMessage NOTIFY promptMessageUpdate)

    Q_PROPERTY(int inventScanCount READ getInventScanCount NOTIFY inventScanChanged)
    Q_PROPERTY(int inventTagNumber READ getInventTagNumber NOTIFY inventScanChanged)
    Q_PROPERTY(int inventFmtTagNumber READ getInventFmtTagNumber NOTIFY inventScanChanged)

public:
    explicit URfidWrapper(QObject *parent = nullptr);
    ~URfidWrapper();

    //srcformat class
    Q_INVOKABLE int checkBarcodeValid(QString barcode);
    Q_INVOKABLE QString epcEncode(QString barcode, int barcodeType=1);
//    Q_INVOKABLE QJsonObject epcDecode(QString epcHex, int formatId = -1);   //不需要

    Q_INVOKABLE bool openURfidWritor(int inventMode, bool useLocalDb=true);
    Q_INVOKABLE bool findTagsForWrite(bool start);
    Q_INVOKABLE QJsonObject writeTag(int poolId, QString barcode, QString epcHex, int usrBankSelect=0);
    Q_INVOKABLE QJsonObject killTag(int poolId);

    Q_INVOKABLE bool setInventifyMode(bool invent);
    Q_INVOKABLE bool runInvent(bool startRun, int scanMode);
//    Q_INVOKABLE void showSysToolbar(int autoHideTime);

    Q_INVOKABLE QJsonObject execDbSql(QString queryCmd, QJsonArray param);

    int getWritedCount()   const    {
        return(wrProxy.writeRec.dailyCount);
    }
    int getKillCount()   const    {
        return(wrProxy.killAuxRec.dailyCount);
    }
    QString getpromptMessage()  const {
        return(miscMessage);
    }

    int getInventScanCount() const {
        return(_inventScanTick);
    }
    int getInventTagNumber() const   {
        return(invent.m_InventLet.count()+invent.m_unExportCount);
    }
    int getInventFmtTagNumber() const   {
        return(invent.m_baseFormatTagCount+invent.m_unExpFormatTagCount);
    }


    QString miscMessage;
signals:
    void findTagTick(int count);        // <0参数 =>停止
    void findTagUpdate(QJsonObject jo);

    void inventScanModeUpdate(bool detailScan);
    void inventScanChanged();
    void inventTagUpdate(QJsonObject jo);

    void writedCountChanged();          //
    void promptMessageUpdate(int level);

    void setImeEnble(bool enable);      //up to WebEngineView
public slots:
//    bool findTagsForWrite(bool start);
    void toggleInventMode();
    void inventResetLet(bool clearAll);
    void setInventScanPeriod(int time_ms);

    void imeEnable(bool en) {       //receive from js
        emit(setImeEnble(en));
    }
    void sysClose();
private:
    RfidReaderMod *rfidDev = NULL;
    SrcdatFormat srcformat;
    WriteBookTags wrProxy;
    bool reqForWrite = false;

    DbStore dbstore;

    InventProxy invent;

    bool _inventMode = false;
    int _inventScanTick = 0;

    void setMiscMessage(QString msg, int level);

private slots:
    void dev_cmdResponse(QString info, int cmd, int status);
    void dev_errMsg(QString info, int errCode);
    void dev_readMemBank(Membank_data_t bankdat, int info);

//    void dev_tagIdentify(IdentifyEPC_t tagEpc, int infoSerial);
    void onReadTagPoolUpdate(IdentifyEPC_t tagEpc, int infoSerial);
    void onReadTagTick(int count, int updId);
    //invent功能
    void onInventTickAck(int para);
    void onInventChangeMode(int mode);
    void onInventUpdate(QByteArray epc, InventifyRecord_t *pRec, bool isNew);

};

#endif // URfidWrapper_H
