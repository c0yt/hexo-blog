---
title: rsync+sersync实现实时备份同步
description: 本文详细介绍了在CentOS 7.9环境下，通过rsync与sersync组合实现实时文件同步的完整方案。rsync负责高效差量传输，sersync通过inotify机制实时监控文件变化并触发同步，有效解决了手动同步延迟问题。
keywords: rsync,Linux,运维
author: 'null'
cover: /img/linux.png
category:
  - Linux
tag:
  - Linux
  - 笔记
  - rsync
  - 运维
abbrlink: 1
date: 2025-04-14 22:18:22
---
## 简介

:::: info (*´▽｀)ノノ
   &nbsp;&nbsp;&nbsp;&nbsp;rsync 是一个常用的 Linux 应用程序，用于文件同步，差量传输，但是每次文件发生变更需要手动去执行命令完成同步，可以依赖inotify进行检测文件变更情况，但需要另外编写脚本，就在苦恼之时，发现了一款工具——**[sersync](https://github.com/wsgzao/sersync)**，它国产开源，内置inotify+rsync命令，可以记录下被监听目录中发生变化的（包括增加、删除、修改）具体某一个文件或者某一个目录的名字，然后使用rsync同步的时候，只同步发生变化的文件或者目录。相对于inotify-tools遍历更快，在同步大量数据时更有优势，搭建更快，无需额外编写脚本。

::::

------



## 环境准备

操作系统：Centos 7.9

| 主机   | IP              | 说明                                             |
| :----- | :-------------- | :----------------------------------------------- |
| backup | 192.168.100.110 | rsync服务端，用于作备份服务器                    |
| web    | 192.168.100.112 | rsync客户端，配合sersync推送数据到backup进行备份 |

## 安装rsync

web主机和backup主机都需要安装rsync

```bash
yum install -y rsync
```

> yum源基本是旧版本，存在漏洞，建议官方编译进行安装，本教程仅演示

## rsync服务端配置

### 编辑`/etc/rsyncd.conf`文件

```bash
vim /etc/rsyncd.conf
```

填入以下内容：

```ini
uid = rsync
gid = rsync
fake super = yes
max connections = 2000
use chroot = no
timeout = 600
log file = /var/log/rsync.log
ignore errors
read only = false
list = false
auth users = rsync_backup
secrets file = /etc/rsync.passwd

[backup]
path = /backup/
comment = Web Backup!!!
```

> 相关内容和参数可自行网上搜索，本教程不作研究

### 编辑`/etc/rsync.passwd`文件

```bash
echo 'rsync_backup:admin' /etc/rsync.passwd
chmod 600 /etc/rsync.passwd
```

> 格式：用户名:密码，密码实际上要尽量复杂
>
> 必须设置权限，保证只有文件所有者可读，不然会报错

### 添加虚拟用户

```bash
useradd -s /sbin/nologin -M rsync
```

### 启动服务

```bash
systemctl enable rsyncd 
systemctl start rsyncd
```

### 检查服务

```bash
[root@web /]$ps -ef | grep rsync
root       3202      1  0 18:00 ?        00:00:00 /usr/bin/rsync --daemon --no-detach
root       3219   2937  0 18:00 pts/1    00:00:00 grep --color=auto rsync
[root@web /]$ss -lntup | grep rsync
tcp    LISTEN     0      5         *:873                   *:*                   users:(("rsync",pid=3202,fd=3))
tcp    LISTEN     0      5      [::]:873                [::]:*                   users:(("rsync",pid=3202,fd=5))
```

### 创建共享目录

```bash
mkdir -p /backup/
sudo chown rsync.rsync -R /backup/
```

## sersync客户端设置

### 安装sersync

```bash
wget https://storage.googleapis.com/google-code-archive-downloads/v2/code.google.com/sersync/sersync2.5.4_64bit_binary_stable_final.tar.gz
tar -zvxf sersync2.5.4_64bit_binary_stable_final.tar.gz
mkdir -p /app/tools/sersync/{bin,conf}
mv GNU-Linux-x86/sersync2 /app/tools/sersync/bin
mv GNU-Linux-x86/confxml.xml /app/tools/sersync/conf
```

> 实际上可以根据需要自行定制放置目录

### 创建备份目录

```bash
mkdir -p /backup/
```

### 设置密钥文件

```bash
echo 'admin' > /etc/rsync.passwd
chmod 600 /etc/rsync.passwd
```

### 修改confxml.xml文件

```bash
vim /app/tools/sersync/conf/confxml.xml
```

修改**23 ~ 36行**xml配置，如图所示

![confxml.xml文件配置参考图](https://s21.ax1x.com/2025/04/14/pEWhOGd.png)

### 启动sersync服务

添加环境变量

```bash
echo "PATH=$PATH:/app/tools/sersync/bin" >> /etc/profile
source /etc/profile
```

启动sersync服务

```bash
sersync2 -rdo /app/tools/sersync/conf/confxml.xml
```

![运行成功截图](https://s21.ax1x.com/2025/04/14/pEW4uZT.png)

> 多个文件可以配置多个confxml.xml文件进行实时同步备份

## 测试服务

在客户端创建文件，看服务端是否自动同步？

![验证图](https://s21.ax1x.com/2025/04/14/pEW45Wj.png)

至此，sersync配置完毕！
