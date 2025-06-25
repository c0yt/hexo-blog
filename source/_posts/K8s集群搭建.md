---
title: K8s集群搭建
description: 本教程将记录通过手动部署K8s集群，掌握 K8s的基础架构、安装流程及常用组件配置
keywords: 'K8s,笔记,运维'
author: 'null'
cover: 'https://kubernetes.io/images/kubernetes.png'
category:
  - K8s
tag:
  - 笔记
  - Linux
  - 运维
  - Docker
  - K8s
abbrlink: 51901
date: 2025-06-25 11:28:33

---

## 前言

&nbsp;&nbsp;&nbsp;&nbsp;本教程将记录通过手动部署K8s集群，掌握 K8s的基础架构、安装流程及常用组件配置。Kubernetes 作为当前主流的容器编排平台，广泛应用于容器化应用的自动化部署、扩展和管理。
&nbsp;&nbsp;&nbsp;&nbsp;在实际操作中，我们将在 `CentOS 7.9` 环境下，按照既定的主机规划和软件版本要求，逐步完成 master 主节点和多个从节点的部署，并通过配置网络、安装必要组件等步骤，实现集群的全面运行。
&nbsp;&nbsp;&nbsp;&nbsp;随着 Kubernetes 的不断演进，容器技术也在持续发展。在2021年底发布的 Kubernetes 1.24 版本中，Kubernetes 正式移除了对 Docker 作为容器运行时的支持。为方便起见，部分功能可能仍用Docker的方案，所以本教程将支持 `Docker` 和 `containerd` 的详细方案分别列出，使用标签或章节的方式进行区分。

## 环境介绍

### 主机规划

| 主机名 |       IP        |   环境    |  角色   |
| :----: | :-------------: | :-------: | :-----: |
| master | 192.168.100.120 | Centos7.9 | 主节点  |
| node1  | 192.168.100.122 | Centos7.9 | 从节点1 |
| node2  | 192.168.100.124 | Centos7.9 | 从节点2 |

### 软件版本

{% tabs software %}

<!-- tab 支持Docker(适用1.24.x前) -->

| 名称                      | 版本号   |
| :------------------------ | -------- |
| kubernetes                | 1.23.6   |
| docker-ce                 | 20.10.14 |
| kubeadm、kubelet、kubectl | 1.23.6   |

<!-- endtab -->

<!-- tab 支持containerd(适用于1.24.x后) -->

| 名称                      | 版本号 |
| :------------------------- | ------ |
| kubernetes                | 1.26.0 |
| containerd                | 1.6.33 |
| kubeadm、kubelet、kubectl | 1.26.0 |

<!-- endtab -->

{% endtabs %}

## 部署步骤

### 准备工作

接下来的命令要在每个节点执行

---

更换yum源为国内源 & 添加k8s源

```bash
# 备份yum源
sudo cp /etc/yum.repos.d/CentOS-Base.repo /etc/yum.repos.d/CentOS-Base.repo.bak
# 更换阿里云源
sudo wget -O /etc/yum.repos.d/CentOS-Base.repo http://mirrors.aliyun.com/repo/Centos-7.repo
# 添加k8s源
cat > /etc/yum.repos.d/kubernetes.repo << EOF
[kubernetes]
name=Kubernetes
baseurl=https://mirrors.aliyun.com/kubernetes/yum/repos/kubernetes-el7-x86_64
enabled=1
gpgcheck=0
repo_gpgcheck=0
gpgkey=https://mirrors.aliyun.com/kubernetes/yum/doc/yum-key.gpg https://mirrors.aliyun.com/kubernetes/yum/doc/rpm-package-key.gpg
EOF
# 清理yum缓存
sudo yum clean all
sudo yum makecache
# 验证新源是否可用
sudo yum repolist
# 更新软件包
sudo yum update -y
```

关闭防火墙、SELinux和Swap分区，**重启后生效**

```bash
# 关闭防火墙
systemctl stop firewalld
# 关闭开机自启
systemctl disable firewalld
# 关闭SELinx
sed -i 's/enforcing/disabled/' /etc/selinux/config
# 关闭swap分区
sed -ri 's/.*swap.*/#&/' /etc/fstab
```

> 在生产环境中，建议使用网络策略来限制 Pod 之间和 Pod 与外部的网络通信，而不是完全关闭防火墙
>
> 关闭 SELinux 可以简化 Kubernetes 集群的配置和维护，避免潜在的权限问题
>
> Kubernetes 官方建议在所有集群节点上禁用 swap 分区，以确保容器可以充分利用主机的物理内存，并避免因为交换空间导致的性能问题

{% tabs ip %}

<!-- tab nmtui图形化配置 -->

给主机配置静态ip，可使用nmtui图形化界面进行配置，配置完成后需重启网络服务

![](https://cdn.fzero.dpdns.org/img/2025/06/b5127a574ca0f3586a8e2081d91d2bcc.png)

<!-- endtab -->

<!-- tab 编辑配置文件 -->

编辑文件`/etc/sysconfig/network-scripts/ifcfg-eth0`

```bash
BOOTPROTO=static
ONBOOT=yes
IPADDR=192.168.100.120
PREFIX=24
GATEWAY=192.168.100.2
DNS1=8.8.8.8
DNS2=114.114.114.114
```

重启网络服务

```bash
sudo systemctl restart network
```

<!-- endtab -->

{% endtabs %}

设置主机名，对每台主机分别配置

```bash
hostnamectl set-hostname master
hostnamectl set-hostname node1
hostnamectl set-hostname node2
```

配置host文件

```bash
cat >> /etc/hosts << EOF
192.168.100.120 master
192.168.100.122 node1
192.168.100.124 node2
EOF
```

配置网络，为所有节点添加网桥过滤和地址转发功能

```bash
# 为所有节点添加网桥过滤和地址转发功能
cat > /etc/sysctl.d/k8s.conf << EOF
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
net.ipv4.ip_forward = 1
vm.swappiness = 0
EOF
# 加载br_netfilter模块
modprobe br_netfilter
# 查看是否加载
lsmod | grep br_netfilter
# 应用新配置
sysctl --system
```

配置时间同步，要选择正确的时区，这里使用ntdate，避免出现不必要的问题

```bash
timedatectl set-timezone Asia/Shanghai
sudo yum install ntpdate -y
ntpdate time.windows.com
```

开启ipvs(非必须，但建议使用)

```bash
# 安装ipset和ipvsadm
yum -y install ipset ipvsadm
# 加载内核模块
cat > /etc/sysconfig/modules/ipvs.modules <<EOF
#!/bin/bash
modprobe -- ip_vs
modprobe -- ip_vs_rr
modprobe -- ip_vs_wrr
modprobe -- ip_vs_sh
modprobe -- nf_conntrack_ipv4
EOF
# 授权、运行、检查是否加载
chmod 755 /etc/sysconfig/modules/ipvs.modules && bash /etc/sysconfig/modules/ipvs.modules && lsmod | grep -e ip_vs -e nf_conntrack_ipv4
```

> IPVS 作为基于内核的负载均衡器，能够实现高效的流量分发，相比基于 iptables 的 kube-proxy 模式，可以显著提升集群的网络性能和吞吐量

{% note info modern %}

快照打卡点1 - 准备工作完成

{% endnote %}

### 安装容器(docker/containerd)

{% tabs box %}

<!-- tab Docker(适用1.24.x前) -->

安装docker

```bash
wget https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo -O /etc/yum.repos.d/docker-ce.repo
sudo yum install -y docker-ce-20.10.14
sudo systemctl start docker
sudo systemctl enable docker
```

配置Docker镜像加速，同时将 Docker 的 cgroup 驱动设置为 systemd

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<EOF
{
    "registry-mirrors": [
        "https://docker.1ms.run",
        "https://docker.xuanyuan.me"
    ],
    "exec-opts": ["native.cgroupdriver=systemd"]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
```

> Docker国内无法拉取镜像，必须配置加速器才可访问，阿里云加速镜像只能在他们的云主机使用，不再免费
>
> Kubernetes 推荐使用 systemd 作为 Docker 的 cgroup 驱动
>
> 需要确保容器运行时和 kubelet 所使用的是相同的 cgroup 驱动，否则 kubelet 进程会失败

查看配置是否生效，如果能拉取镜像就代表配置成功

```bash
docker info
docker run hello-world
```

<!-- endtab -->

<!-- tab containerd(适用于1.24.x后) -->

安装containerd

```bash
# 添加阿里云仓库源
wget https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo -O /etc/yum.repos.d/docker-ce.repo
yum -y install containerd
```

> 国内连接github速度慢，下载不了建议scp传到主机上

安装crictl

```bash
wget https://github.com/kubernetes-sigs/cri-tools/releases/download/v1.27.1/crictl-v1.27.1-linux-amd64.tar.gz
tar xf crictl-v1.27.1-linux-amd64.tar.gz -C /usr/local/bin
# 添加到环境变量
echo 'export PATH=$PATH:/usr/local/bin' >> ~/.bashrc
source ~/.bashrc
```

配置containerd

```bash
containerd config default > /etc/containerd/config.toml
sed -i 's#SystemdCgroup = false#SystemdCgroup = true#' /etc/containerd/config.toml
sed -i 's@registry.k8s.io/pause:3.6@registry.aliyuncs.com/google_containers/pause:3.9@' /etc/containerd/config.toml
```

编辑文件`/etc/containerd/config.toml`配置镜像加速(155-157行)

```bash
       [plugins."io.containerd.grpc.v1.cri".registry.mirrors]
           [plugins."io.containerd.grpc.v1.cri".registry.mirrors."docker.io"]
             endpoint = ["https://docker.1ms.run"]
```

启动并启用containerd

```bash
systemctl daemon-reload
systemctl start containerd
systemctl enable containerd
```

配置crictl

```bash
cat >> /etc/crictl.yaml << EOF
runtime-endpoint: unix:///run/containerd/containerd.sock
image-endpoint: unix:///run/containerd/containerd.sock
timeout: 3
debug: true
EOF
```

拉取镜像进行测试

```bash
crictl pull nginx:latest
crictl images
```

![image-20250625174959829](https://cdn.fzero.dpdns.org/img/2025/06/d4eb13dba2c03422d219a922ec0285b2.png)

<!-- endtab -->

{% endtabs %}

{% note info modern %}

快照打卡点2 - Docker初始化完成

{% endnote %}

### 部署K8S集群

#### 安装kubeadm工具

{% tabs kubeadm %}

<!-- tab 适用1.23.6版本(Docker) -->

安装kubeadm，kubelet，kubectl，这三个版本必须**保持一致**，否则可能会导致一些**预料之外的错误和问题**

```bash
yum install -y kubeadm-1.23.6 kubelet-1.23.6 kubectl-1.23.6
```

> 自 Kubernetes 1.24 版起，Dockershim 已从 Kubernetes 项目中移除
>
> 不再支持Docker，默认CRI为containerd
>
> kubeadm -> 用来初始化集群的指令
>
> kubelet    -> 在集群中的每个节点上用来启动 Pod 和容器等
>
> kubectl    -> 用来与集群通信的命令行工具

配置开机自启，不启动，还没配置初始化集群

```bash
sudo systemctl enable kubelet
```

<!-- endtab -->

<!-- tab 适用1.26.0版本(containerd) -->

安装kubeadm相关工具

```bash
yum -y install kubelet-1.26.0 kubectl-1.26.0 kubeadm-1.26.0
```

配置开机自启动

```bash
systemctl enable --now kubelet
```

<!-- endtab -->

{% endtabs %}

配置kubeadm和kubectl命令补全

```bash
yum install -y bash-completion 
kubeadm completion bash > /etc/bash_completion.d/kubeadm
kubectl completion bash > /etc/bash_completion.d/kubectl
source /etc/bash_completion.d/kubeadm /etc/bash_completion.d/kubectl
```

拉取CoreDNS镜像

```bash
# 拉取镜像
docker pull coredns/coredns:1.8.4
# 将镜像打上tag
docker tag coredns/coredns:1.8.4 registry.aliyuncs.com/google_containers/coredns:v1.8.4
```

> CoreDNS主要是用作服务发现，也就是服务(应用)之间相互定位的过程

在初始化前要检查每台主机mac地址和uuid，必须唯一存在 (一般唯一，如果虚拟机克隆可能一致)

mac地址检查：

```bash
ifconfig -a
```

uuid检查：

```bash
sudo cat /sys/class/dmi/id/product_uuid
```

{% note info modern %}

快照打卡点3 - 安装kubeadm工具等

{% endnote %}

---

#### master节点初始化

接下来的命令只在master节点执行

---

{% tabs kubeadm init %}

<!-- tab 适用1.23.6版本(Docker) -->

进行master节点的初始化

```bash
kubeadm init \
  --apiserver-advertise-address=192.168.100.120 \
  --image-repository registry.cn-hangzhou.aliyuncs.com/google_containers \
  --kubernetes-version v1.23.6 \
  --pod-network-cidr=192.168.0.0/16 \
  --service-cidr=10.96.0.0/12
```

> 参数解释：
>
> --apiserver-advertise-address：API Server 对外广播的 IP 地址，需指定成master节点的ip地址
>
> --image-repository：指定阿里云的镜像，避免国内因为网络问题，无法拉取镜像
>
> --kubernetes-version：指定k8s版本
>
> --pod-network-cidr：指定 Pod 的网络地址段，通常与后续部署的 CNI 网络插件配合使用，确保匹配
>
> --service-cidr：Service 虚拟 IP 地址段，初始化后不能修改

更多参数说明可参考kubeadm的官网文档👇
{% link https://kubernetes.io/zh-cn/docs/reference/setup-tools/kubeadm/kubeadm-init/,kubeadm init | Kubernetes,https://kubernetes.io/images/kubernetes.png,kubeadm init相关参数介绍 %}
如果如下图所示，则初始化成功
![](https://cdn.fzero.dpdns.org/img/2025/06/82a956129ce2f6761483893a40e36bca.png)


root用户执行下方的命令，都要执行

```bash
# 非root
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

```bash
# root
export KUBECONFIG=/etc/kubernetes/admin.conf
```

记录下最后两行，后续用于将从节点加入集群，有效期24h

```bash
kubeadm join 192.168.100.120:6443 --token 6wc95u.nikjke0wd92h6zqz \
	--discovery-token-ca-cert-hash sha256:b4488f841af9fe7edbd4bce96d169b82f1da3b317c89b4d6ba1e6a95646c5766
```

> 后面也可以使用`kubeadm token create --print-join-command`命令获取

<!-- endtab -->

<!-- tab 适用1.26.0版本(containerd) -->

在master节点初始化，生成初始化配置文件

```bash
kubeadm config print init-defaults > kubeadm-init.yml
```

编辑初始化配置文件`kubeadm-init.yml`

```yaml
apiVersion: kubeadm.k8s.io/v1beta3
bootstrapTokens:
- groups:
  - system:bootstrappers:kubeadm:default-node-token
  token: abcdef.0123456789abcdef
  ttl: 24h0m0s
  usages:
  - signing
  - authentication
kind: InitConfiguration
localAPIEndpoint:
  advertiseAddress: 192.168.100.120 # 配置master主节点IP
  bindPort: 6443
nodeRegistration:
  criSocket: unix:///var/run/containerd/containerd.sock # 使用containerd的Unix socket地址
  imagePullPolicy: IfNotPresent
  name: node
  taints: null
---
apiServer:
  timeoutForControlPlane: 4m0s
apiVersion: kubeadm.k8s.io/v1beta3
certificatesDir: /etc/kubernetes/pki
clusterName: kubernetes
controllerManager: {}
dns: {}
etcd:
  local:
    dataDir: /var/lib/etcd
imageRepository: registry.aliyuncs.com/google_containers # 替换成国内源(可选)
kind: ClusterConfiguration
kubernetesVersion: 1.26.0
networking:
  dnsDomain: cluster.local
  serviceSubnet: 10.96.0.0/12
  podSubnet: 192.168.0.0/16 # 为pod网络指定网络段
scheduler: {}

#表明cgroup用 systemd
---
apiVersion: kubelet.config.k8s.io/v1beta1
kind: KubeletConfiguration
cgroupDriver: systemd
failSwapOn: false

#启用ipvs
---
apiVersion: kubeproxy.config.k8s.io/v1alpha1
kind: KubeProxyConfiguration
mode: ipvs
```

更多参数说明可参考kubeadm的官网文档👇
{% link https://kubernetes.io/zh-cn/docs/reference/setup-tools/kubeadm/kubeadm-init/,kubeadm init | Kubernetes,https://kubernetes.io/images/kubernetes.png,kubeadm init相关参数介绍 %}

分发初始化配置文件，下载镜像

```bash
scp kubeadm-init.yaml node1:/root/
scp kubeadm-init.yaml node2:/root/
# 在node1和node2都拉取镜像
cd /root && kubeadm config images pull --config kubeadm-init.yml
```

拉取结果如下：

```bash
[root@node1 ~]# kubeadm config images pull --config kubeadm-init.yml 
[config/images] Pulled registry.aliyuncs.com/google_containers/kube-apiserver:v1.26.0
[config/images] Pulled registry.aliyuncs.com/google_containers/kube-controller-manager:v1.26.0
[config/images] Pulled registry.aliyuncs.com/google_containers/kube-scheduler:v1.26.0
[config/images] Pulled registry.aliyuncs.com/google_containers/kube-proxy:v1.26.0
[config/images] Pulled registry.aliyuncs.com/google_containers/pause:3.9
[config/images] Pulled registry.aliyuncs.com/google_containers/etcd:3.5.6-0
[config/images] Pulled registry.aliyuncs.com/google_containers/coredns:v1.9.3
```

master节点执行初始化集群命令

```
#执行初始化并将日志记录到 kubeadm-init.log 日志文件中
kubeadm init --config=kubeadm-init.yml | tee kubeadm-init.log
```

出现如图所示字样，则初始化成功

![image-20250625183118845](https://cdn.fzero.dpdns.org/img/2025/06/d6862367ffa4d8182162ff5ba2769fab.png)

在master主机执行

```
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
export KUBECONFIG=/etc/kubernetes/admin.conf
```

记录join语句，后面加入node1和node2节点要用

```bash
kubeadm join 192.168.100.120:6443 --token abcdef.0123456789abcdef \
	--discovery-token-ca-cert-hash sha256:adf8dfd95c3bbf7e62258d06c2ff8d16cc3cfa6ed7b6e9dd1563be4e753568f9
```

> 后面也可以使用`kubeadm token create --print-join-command`命令获取


<!-- endtab -->

{% endtabs %}

{% note info modern %}

快照打卡点4 - master节点初始化成功

{% endnote %}

#### 安装网络插件CNI

CNI（Container Network Interface）意为容器网络通用接口，它是一种标准的设计，为了让用户在容器创建或销毁时都能够更容易地配置容器网络。在本文中，我们将集中探索与对比目前最流行的 CNI插件 ：Flannel、Calico、Weave 和 Canal。这些插件既可以确保满足Kubernetes的网络要求，又能为Kubernetes集群管理员提供他们所需的某些特定的网络功能。

+ Flannel：一个简单易用的网络解决方案，支持多种部署模式。
+ Calico：一个高度可扩展的容器网络方案，旨在为大规模生产环境提供网络和安全性。
+ Weave：一个分布式的容器网络方案，具有良好的可扩展性和高度自动化的管理。
+ Cilium：一个基于 eBPF 的容器网络和安全解决方案，提供强大的流量控制和安全性。

---

安装calico网络插件

```bash
kubectl apply -f https://docs.projectcalico.org/manifests/calico.yaml
```

![](https://cdn.fzero.dpdns.org/img/2025/06/838b6ebd3fc3b7025040f76b813eed8f.png)

#### node节点加入集群

将node1和node2节点加入集群，都要执行

![](https://cdn.fzero.dpdns.org/img/2025/06/0bf500df7f02b1143e66ff05f6b19f3f.png)

切换master节点等待集群初始化完成，变成running，以下命令可实时查看进度

```bash
kubectl get pods -n kube-system -w
```

检查节点状态

```bash
kubectl get nodes
```

等待集群部署完毕，需要挺久的，全部running状态即成功

![](https://cdn.fzero.dpdns.org/img/2025/06/b4173e530c6b17f0977b51f068b64a0d.png)

{% note info modern %}

快照打卡点5 - 所有集群都初始化成功

{% endnote %}

#### 安装Kuboard

安装Kuboard，查看状态，当全部变成running即成功

```bash
kubectl apply -f https://addons.kuboard.cn/kuboard/kuboard-v3.yaml
kubectl get pods -n kuboard -w
```

![](https://cdn.fzero.dpdns.org/img/2025/06/06c87e57467810b12507d1a0880e40cd.png)

部署成功，访问[http://node:30080](http://your-node-ip-address:30080)

![](https://cdn.fzero.dpdns.org/img/2025/06/9209517f41aa0e632d0505c5922efc9b.png)

{% note info modern %}

快照打卡点6 - 部署Kuboard成功

{% endnote %}

## 遇到的问题

### 分配的内存不足

一开始给node节点分配的1h1g，后续安装kubeadm相关工具时报错提示内存不足，建议2h2g以上

![](https://cdn.fzero.dpdns.org/img/2025/06/206cd98ac9dc8bee97a09d6fc0897b3c.png)

### node无法加入集群

节点加入时可能会由于网络问题或令牌过期等原因失败

这时候可以检查 Master 节点的防火墙设置，确保 6443 端口是开放的。

如果令牌过期，重新生成一个加入令牌并重新尝试加入

```bash
kubeadm token create --print-join-command
```

### 检查节点状态报错

```bash
[root@master sky]# kubectl get nodes
The connection to the server localhost:8080 was refused - did you specify the right host or port?
```

因为 `kubectl` 无法连接到 Kubernetes API 服务器，`kubectl` 使用 `kubeconfig` 文件来连接到 Kubernetes 集群。如果未正确配置，会导致连接失败

检查kubelet运行情况，正常

```bash
systemctl status kubelet
```

![image-20250625170328550](https://cdn.fzero.dpdns.org/img/2025/06/e2f8ee644e9a69f487383fd6a64fea77.png)

排查后是未配置好`kubeconfig`文件

root用户也需要执行

```bash
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```



如有更多问题，可参考官方的故障排查手册👇

{% link https://kubernetes.io/zh-cn/docs/setup/production-environment/tools/kubeadm/troubleshooting-kubeadm/,对 kubeadm 进行故障排查 | Kubernetes,https://kubernetes.io/images/kubernetes.png,kubeadm 故障排查手册 %}

## 参考文章

{% link https://blog.constrk.ip-ddns.com/2025/04/13/centos%E8%99%9A%E6%8B%9F%E6%9C%BA%E9%9B%86%E7%BE%A4%E9%83%A8%E7%BD%B2k8s-containerd%E9%9B%86%E7%BE%A4/,centos虚拟机集群部署k8s+containerd集群,https://blog.constrk.ip-ddns.com/images/favicon.ico,centos虚拟机集群部署k8s+containerd集群 %}
{% link https://www.cnblogs.com/hukey/p/17428157.html,部署k8s 集群1.26.0（containerd方式）-CSDN博客,https://blog.csdn.net/favicon.ico,k8s集群1.26.0部署 %}
{% link https://blog.csdn.net/hedao0515/article/details/145700505/,k8s-1.26.0 + Containerd安装过程 - hukey - 博客园,https://cdn.fzero.dpdns.org/img/2025/06/66a7b83bb176d32bb16399ba1b9a41a5.ico,k8s-1.26.0 + Containerd %}
{% link https://blog.csdn.net/m0_51720581/article/details/131153894,K8s安装部署--超级详细（无坑，v1.23）_kubernetes 1.23-CSDN博客,https://blog.csdn.net/favicon.ico,k8s集群1.23.6部署 %}
{% link https://kubernetes.io/zh-cn/docs/setup/production-environment/tools/kubeadm/install-kubeadm/,安装 kubeadm | Kubernetes,https://kubernetes.io/images/kubernetes.png,kubeadm安装教程 %}
{% link https://kuboard.cn/install/v3/install.html,安装 Kubernetes 多集群管理工具 - Kuboard v3 | Kuboard,https://kuboard.cn/favicon.png,Kuboard面板安装教程 %}
