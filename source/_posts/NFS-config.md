---
title: NFS配置
author: 'null'
description: 本文系统讲解NFS网络文件系统的配置与优化，涵盖服务端部署、共享目录权限设置、客户端挂载方法，以及用户压缩（root_squash/all_squash）、安全挂载选项（noexec/nosuid）等高级配置。通过实战步骤演示如何实现跨服务器文件共享，特别强调生产环境中的权限控制与数据安全策略，为集群存储、虚拟机共享等场景提供可靠解决方案。
keywords: NFS,Linux,运维
cover: /img/bak.webp
categories:
  - Linux
tags:
  - Linux
  - 笔记
  - NFS
  - 运维
abbrlink: 1
date: 2025-04-12 21:54:00
---
## 简介

:::: info (*´▽｀)ノノ
   &nbsp;&nbsp;&nbsp;&nbsp;**NFS**（Network File System） 是由 Sun Microsystems 开发的一种**分布式文件系统协议**，允许通过网络在多台计算机之间共享文件和目录。它通过将**远程存储挂载到本地文件系统**，实现跨服务器的透明文件访问，广泛应用于**集群存储**、**虚拟机共享数据**、**Web服务静态资源同步**等场景。
::::

---------------------------------------------------------------------------------------------------------------------------------------
## 安装NFS服务

### 1.检测安装情况
```bash
rpm -qa | grep nfs-utils
rpm -qa | grep rpcbind
```
### 2.未安装情况
```bash
yum -y install nfs-utils rpcbind
```
## 服务端配置
### 1.启动rpcbind服务
```bash
systemctl enable rpcbind
systemctl start rpcbind
```
### 2.启动NFS服务
```bash
systemctl enable nfs
systemctl start nfs
```
### 3.检查RPC 服务注册状况
```bash
[root@study sky]# rpcinfo -p
   program vers proto   port  service
    100000    4   tcp    111  portmapper
    100000    3   tcp    111  portmapper
    100000    2   tcp    111  portmapper
    100000    4   udp    111  portmapper
    100000    3   udp    111  portmapper
    100000    2   udp    111  portmapper
    100024    1   udp  50680  status
    100024    1   tcp  59650  status
    100005    1   udp  20048  mountd
    100005    1   tcp  20048  mountd
    100005    2   udp  20048  mountd
    100005    2   tcp  20048  mountd
    100005    3   udp  20048  mountd
    100005    3   tcp  20048  mountd
    100003    3   tcp   2049  nfs
    100003    4   tcp   2049  nfs
    100227    3   tcp   2049  nfs_acl
    100003    3   udp   2049  nfs
    100003    4   udp   2049  nfs
    100227    3   udp   2049  nfs_acl
    100021    1   udp  48973  nlockmgr
    100021    3   udp  48973  nlockmgr
    100021    4   udp  48973  nlockmgr
    100021    1   tcp  33609  nlockmgr
    100021    3   tcp  33609  nlockmgr
    100021    4   tcp  33609  nlockmgr
```
### 4.创建共享目录
```bash
mkdir -p /data/
chown -R nfsnobody.nfsnobody /data/
```
### 5.编辑`/etc/exports`文件
```bash
vim /etc/exports
```
填写以下内容
```bash
/data/  192.168.100.1/24(rw)
# 限制192.168.100.1/24网段可访问，rw为读写权限
```
### 6.重新加载配置文件
```
systemctl reload nfs
```
### 7.检查服务端共享信息
```bash
[root@study data]# showmount -e localhost
Export list for localhost:
/data 192.168.100.1/24
```
## 客户端配置
### 1.安装NFS
```bash
yum -y install nfs-utils
```
### 2.创建挂载目录
```bash
mkdir -p /data/
```
### 3.挂载共享目录
#### (1).临时挂载
```bash
mount -t nfs 192.168.100.1:/data/ /data/ -o proto=tcp -o nolock
```
#### (2).永久挂载
- 方法一：将挂载命令写入`/etc/rc.local`文件
  ```bash
  vim /etc/rc.local
  chmod +x /etc/rc.d/rc.local
  ```
- 方法二：将相关配置写入`/etc/fstab`文件
  ```bash
  192.168.100.1:/data/  /data/ nfs  defaults 0 0
  ```
### 4.查看挂载结果
```bash
[root@study /]# df -h
Filesystem             Size  Used Avail Use% Mounted on
devtmpfs               471M     0  471M   0% /dev
tmpfs                  487M     0  487M   0% /dev/shm
tmpfs                  487M   15M  472M   4% /run
tmpfs                  487M     0  487M   0% /sys/fs/cgroup
/dev/sda3               27G  5.6G   22G  21% /
/dev/sda1              297M  213M   85M  72% /boot
tmpfs                   98M   28K   98M   1% /run/user/1000
192.168.100.1:/data   27G  5.6G   22G  21% /data
```
至此，NFS配置结束，如有需要，可配置目录权限

## 高级选项

### 1. 核心配置

| 服务端配置 | 说明                                                         |
| :--------- | :----------------------------------------------------------- |
| rw         | 可以读写共享目录                                             |
| ro         | 只读 read only                                               |
| sync       | 同步,只要用户上传,就把数据写到磁盘上                         |
| async      | 异步,用户上传的数据,nfs先临时存放到内存中,过一段时间写入到磁盘. 并发高,数据可能丢失 |

### 2.用户压缩

- 介绍：NFS客户端挂载NFS服务端后,创建的文件默认属于nfsnobody,这种操作就叫用户压缩(映射)

  | 服务端配置选项     | 说明                                                         |
  | ------------------ | ------------------------------------------------------------ |
  | root_squash        | 如果客户端是 root 用户访问，则到了 NFS 服务端会被压缩（**默认的**） |
  | no_all_squash      | 如果客户端不是 root 用户访问，则不进行压缩（保存原始用户，**默认的**） |
  | all_squash         | 所有用户都进行压缩（不是太安全）                             |
  | anonuid 和 anongid | 用于指定压缩的匿名用户（默认是 nfsnobody 用户）anonuid=65534, anongid=65534 |

  实际生成环境下，最好指定一个用户用于NFS，流程可如下：

  - 部署NFS服务，rpcbind

  - 添加指定用户，指定UID,GID

  - 修改服务端配置文件

  - 客户端进行挂载测试

### 3.安全优化

​	为尽可能保证安全性，需让客户端挂载 只能上传,而无法执行
 ```bash
 mount -o noexec,nosuid,nodev -t nfs 192.168.100.1:/data/ /data/
 ```
> noexec 挂载的NFS目录中如果有命令，无法运行
> nosuid 带有suid的命令
> nodev 带有特殊属性的文件

## 关于取消挂载
```bash
[root@study /]# umount /data/
[root@study /]# df -h
Filesystem      Size  Used Avail Use% Mounted on
devtmpfs        471M     0  471M   0% /dev
tmpfs           487M     0  487M   0% /dev/shm
tmpfs           487M   15M  472M   4% /run
tmpfs           487M     0  487M   0% /sys/fs/cgroup
/dev/sda3        27G  5.6G   22G  21% /
/dev/sda1       297M  213M   85M  72% /boot
tmpfs            98M   32K   98M   1% /run/user/1000
```

