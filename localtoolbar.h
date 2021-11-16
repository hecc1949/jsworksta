#ifndef LOCALTOOLBAR_H
#define LOCALTOOLBAR_H

#include <QObject>
#include <QToolBar>

class LocalToolBar : public QToolBar
{
    Q_OBJECT
public:
    explicit LocalToolBar(QWidget *parent = nullptr);

    void setAutoShow(int time_ms);
protected:
    void timerEvent(QTimerEvent *);

private:
    int _timerId = -1;
    QAction* fileOutAction;
    QAction* netCfgAction;
    QAction* fileRemoveAction;
    QAction* updateFilesAction;
signals:

private slots:
    void doFilecopy();
    void doFileRemove();
    void doUpdateFilecopy();
public slots:
    void onSysDeviceChange(QString path);
};

#endif // LOCALTOOLBAR_H
