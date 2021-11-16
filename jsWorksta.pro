#-------------------------------------------------
#
# Project created by QtCreator 2020-07-28T17:36:22
#
#-------------------------------------------------

QT       += core gui webenginewidgets webchannel websockets   \
        serialport sql network

greaterThan(QT_MAJOR_VERSION, 4): QT += widgets

TARGET = jsWorksta
TEMPLATE = app

VERSION = 0.2.0
DEFINES += VERSION_STRING=\\\"$${VERSION}\\\"

INCLUDEPATH += $$PWD/../urfidLib/inc
DEPENDPATH += $$PWD/../urfidLib/inc

if(contains(DEFINES,ARM))   {
    target.path=/usr/jsworksta
    INSTALLS += target
    usrhtml.path = /usr/jsworksta

    LIBS += -L$$PWD/../urfidLib-build-arm -lurfid
}
else    {
    usrhtml.path = $${OUT_PWD}
    LIBS += -L$$PWD/../urfidLib-build-pc -lurfid
}

usrhtml.files = urfidbooks.html urfidView.css easyui-lang-zh_CN.js
usrhtml.files += jquery.easyui.min.js jquery.min.js easyui.css icon.css
usrhtml.files += wod-index.js devlinker.js
usrhtml.files += utils.js urfidMisc.js urfidInvent.js urfidwr.js
INSTALLS += usrhtml

#message($$usrhtml.files)

# The following define makes your compiler emit warnings if you use
# any feature of Qt which has been marked as deprecated (the exact warnings
# depend on your compiler). Please consult the documentation of the
# deprecated API in order to know how to port your code away from it.
DEFINES += QT_DEPRECATED_WARNINGS

#DEFINES += QT_NO_WARNING_OUTPUT
#    QT_NO_DEBUG_OUTPUT

# You can also make your code fail to compile if you use deprecated APIs.
# In order to do so, uncomment the following line.
# You can also select to disable deprecated APIs only up to a certain version of Qt.
#DEFINES += QT_DISABLE_DEPRECATED_BEFORE=0x060000    # disables all the APIs deprecated before Qt 6.0.0


SOURCES += \
        main.cpp \
        containerwindow.cpp \
    websinglepageview.cpp \
    urfidwrapper.cpp \
    networkchecker.cpp \
    urfidAux.cpp \
    localtoolbar.cpp \
    netconfigdialog.cpp \
    websocketchannel.cpp

HEADERS += \
        containerwindow.h \
    websinglepageview.h \
    urfidwrapper.h  \
    ../urfidLib/inc/srcdatformat.h \
    ../urfidLib/inc/writebooktags.h    \
    ../urfidLib/inc/dev_r200.h \
    ../urfidLib/inc/rfidreadermod.hpp  \
    ../urfidLib/inc/gpiodev.h \
    ../urfidLib/inc/dbstore.h  \
    ../urfidLib/inc/inventproxy.h \
    networkchecker.h \
    localtoolbar.h \
    netconfigdialog.h \
    websocketchannel.h

FORMS += \
        containerwindow.ui \
    passworddlg.ui \
    netconfigdialog.ui

RESOURCES += \
    resources.qrc

DISTFILES += \
    ReadMe.md \
    easyui.css \
    jquery.easyui.min.js \
    easyui-lang-zh_CN.js \
    icon.css \
    bookUItems.json \
    EpcDefItems.json \
    banksConfig.json \
    urfidInvent.js \
    urfidMisc.js \
    wod-index.js \
    urfidbooks.html \
    devlinker.js

