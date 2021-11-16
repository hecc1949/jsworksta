#ifndef URfidWrapper_H
#define URfidWrapper_H

#include <QObject>
#include <QJsonObject>
#include "srcdatformat.h"
#include "writebooktags.h"
#include "dbstore.h"
#include "inventproxy.h"

class URfidWrapper : public QObject
{
    Q_OBJECT
public:
    explicit URfidWrapper(QObject *parent = nullptr);
    ~URfidWrapper();
    void closeServer();

    Q_INVOKABLE QJsonObject doCommand(QString cmd, QJsonArray param);
signals:
    void setImeEnble(bool enable);      //up to WebEngineView
//    void onDeviceEvent(QJsonObject);    //webchannel, to javascript. 统一封装event输出
    void deviceEvent(QJsonObject);    //webchannel, to javascript. 统一封装event输出

public slots:

private:
    RfidReaderMod *rfidDev = NULL;
    SrcdatFormat srcformat;
    WriteBookTags wrProxy;
//    bool reqForWrite = false;

    DbStore dbstore;
    QString miscMessage;

    InventProxy invent;
    bool _inventMode = false;
    int _inventScanTick = 0;

    QString _xupdatePrompt = "";

    //读写器接口
    bool openURfidWritor(int inventMode, bool useLocalDb=true);
    bool setInventifyMode(bool invent);
    void setMiscMessage(QString msg, int level);

    int checkBarcodeValid(QString barcode);
    QString epcEncode(QString barcode, int barcodeType=1);
    bool findTagsForWrite(bool start);
    QJsonObject writeTag(int poolId, QString barcode, QString epcHex, int usrBankSelect=0);
    QJsonObject killTag(int poolId);
    QJsonObject writeEpcBankWord(int poolId, int item_oid, int value);

    //js接口封装
    QJsonObject doInventCommand(QString cmd, QJsonArray param);     //doCommand的二次分发函数
    QJsonObject doTagwrCommand(QString cmd, QJsonArray param);
    QJsonObject doMiscCommand(QString cmd, QJsonArray param);

//    void sendInventCounts();                //小的sub-function
    void sendTagwrRunValue(QJsonObject jo);

    //扩展功能
    void sysClose();
    QString getExtMediaPath();
    QString doSysFileOpenDialog(QString initDir, QString filter);
    QJsonObject doSysFileCommand(QString cmd, QString srcFiles, QString dstPath);

    QJsonObject execDbSql(QString queryCmd, QJsonArray param);
    QJsonObject exportDbRecords(int tabSelInvent, QString filename);
    QJsonArray getSysConfigs();
    int setSysConfigs(QJsonArray param);
    QByteArray loadJsonTextFile(QString path);
    bool saveJsonTextFile(QByteArray joStr, QString path);

private slots:
    //接收来自读写器的signal
        //write-tag
    void dev_cmdResponse(QString info, int cmd, int status);
    void dev_errMsg(QString info, int errCode);
    void dev_readMemBank(Membank_data_t bankdat, int info);

    void onReadTagPoolUpdate(IdentifyEPC_t tagEpc, int infoSerial);
    void onReadTagTick(int count, int updId);
        //invent功能
    void onInventTickAck(int para);
    void onInventChangeMode(int mode);
    void onInventUpdate(QByteArray epc, InventifyRecord_t *pRec, bool isNew);
};

#endif // URfidWrapper_H
