#include "containerwindow.h"
#include <QApplication>
#include <QMutex>
#include <iostream>

QMutex mutex;

void logMessageFilter(QtMsgType type, const QMessageLogContext &context, const QString &msg)
{
    Q_UNUSED(type);
    mutex.lock();

    //在调试窗口输出
//    if (msg.indexOf("Mixed Content:") <0)
    if ((type != QtWarningMsg)||(QString(context.category) !="js" ))
    {
        std::cout << msg.toStdString().data()<<std::endl;
    }

    mutex.unlock();
}


int main(int argc, char *argv[])
{
    qputenv("QT_IM_MODULE",QByteArray("Qt5Input"));
//    qputenv("QTWEBENGINE_REMOTE_DEBUGGING", "9223");

    QApplication a(argc, argv);
//    qInstallMessageHandler(logMessageFilter);

    ContainerWindow w;
    w.show();

    int res = a.exec();
    w.repaint();
    return res;
//    return a.exec();
}
