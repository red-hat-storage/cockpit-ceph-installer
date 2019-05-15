# cockpit-ceph-installer
This project aims to provide a simple means to deploy a Ceph cluster by 'teaming up' with the ansible-runner and runner-service projects. The goal is to use the cockpit UI to gather all the settings necessary to drive a ceph-ansible playbook to install your Ceph cluster. It also uses the ceph-check-role ansible module to handle the validation of role against host configuration.

## Project Status
The plugin currently
- creates the ansible inventory file (including hosts_vars and groups_vars)
- supports different Ceph versions, bluestore and filestore, encrypted/non-encrypted
- for a Nautilus target, a metrics hosts is required for full prometheus/grafana support
- probes and validates candidate hosts against their intended Ceph role(s)
- presents ans selects available networks for the public, cluster and S3 networks
- provides a review of the selections made
- configuration options selected are committed to standard yml format ansible files (host & group vars)
- initiates the ceph-ansible playbook and monitor progress
- any deployment errors are shown in the UI
- following a Nautilus based deployment, the user may click a link to go straight to Ceph's web management console
- allows environment defaults to be overridden from `var/lib/cockpit/ceph-installer/defaults.json`
- supported roles: mons (inc mgrs), mds, osds, rgws and iscsi gateways

## Curious, take a look...

[![demo](screenshots/ceph-installer-2019-04.gif)](https://youtu.be/wIw7RjHPhzs)

## Take it for a testdrive
In this example we'll assume that you have a test VM ready to act as an ansible controller, and a set of VMs that you want to install Ceph to. Remember to ensure that the machines can each resolve here names (/etc/hosts will be fine!) All the commands need system privileges, so you'll need root or a sudo enabled account.
### 1. Configure the pre-requisites
#### **Fedora 28/29/30**
  * As root run the following commands to install pre-requisite packages
```
# dnf install docker cockpit-ws cockpit-bridge git wget
```

#### **RHEL7**
  * Install pre-requisite packages
```
# yum install -y docker cockpit-ws cockpit-bridge git wget
```

### **CentOS 7**
* As root run the following commands to install pre-requisite packages
```
# yum install -y docker cockpit git wget
```

### 2. Setup the ansible-runner-service container

2.1 Enable and start docker daemon
```
# sudo systemctl enable docker.service
# sudo systemctl start docker.service
```

2.2 Pull the image from docker hub (~670MB)
```
# sudo docker pull jolmomar/ansible_runner_service
```

### 3. Enable the cockpit interface
If your testing with Ceph Nautilus, the installer requires a host for Metrics (prometheus and grafana). The port used by Prometheus conflicts with the port used by cockpit, so if you want to run the metrics services on the 'ansible host, you need to;
  3.1 Set up an overridge file for cockpit
```
# sudo su -
# mkdir /etc/systemd/system/cockpit.socket.d
# echo -e "[Socket]\nListenStream=\nListenStream=9091" > /etc/systemd/system/cockpit.socket.d/listen.conf
# systemctl daemon-reload
# exit
```
  3.2 If SELINUX is enabled, you may also need to allow the new port to be used
```
# sudo semanage port -a -t websm_port_t -p tcp 9091
```
  3.3 Start the cockpit service
```
sudo systemctl enable --now cockpit.socket
```
*for further information, the offical docs are [here](https://cockpit-project.org/guide/latest/listen.html)*

### 4. Grab ceph-ansible from the Ceph project
4.1 Pull ceph-ansible from github and switch to the wip-dashboard branch (just until this merges!)
```
# sudo su -
# cd /usr/share
# git clone https://github.com/ceph/ceph-ansible.git
# cd ceph-ansible
# git checkout wip-dashboard
# git pull
# exit
```
4.2 From the /usr/share/ceph-ansible directory, add the check_check_role module to ceph-ansible
```
# sudo wget -P ./library https://raw.githubusercontent.com/pcuzner/ceph-check-role/master/library/ceph_check_role.py
# sudo wget -P ./ https://raw.githubusercontent.com/pcuzner/ceph-check-role/master/checkrole.yml
```

### 5. Setup the ansible-runner-service
Although the ansible-runner-service runs as a container, it's configuration and playbooks come from the host filesystem.

5.1 create configuration directories
```
# sudo su -
# mkdir /etc/ansible-runner-service
# mkdir -p /usr/share/ansible-runner-service/{env,inventory,artifacts}
# mkdir -p /etc/ansible-runner-service/certs/{client,server}
# chcon -Rt container_file_t /usr/share/ansible-runner-service
# chcon -Rt container_file_t /etc/ansible-runner-service
# exit
```
5.2 Seed the /etc/ansible-runner-service directory

```
# sudo docker run --rm=true -d --network host -v /usr/share/ansible-runner-service:/usr/share/ansible-runner-service -v /etc/ansible-runner-service:/etc/ansible-runner-service -v /usr/share/ceph-ansible:/usr/share/ansible-runner-service/project --name runner-service jolmomar/ansible_runner_service:latest

# sudo docker exec -it runner-service cp /root/ansible-runner-service/{logging,config}.yaml /etc/ansible-runner-service

```
5.3 Create the self-signed cert, server and client certificates
```
sudo docker exec -it runner-service /root/ansible-runner-service/misc/nginx/generate_certs.sh
```
5.3 Restart the service
```
sudo docker restart runner-service
```

5.4  Define some example ssh access

In the runner-service container, add multiple entries to /etc/hosts to represent hosts all pointing to the main ip in the host where runs the Ansible Runner Service container. Use the the container's host ip address in each of the new entries for the test hosts

eg:
```
# sudo docker exec -it runner-service /bin/bash
# cat /etc/hosts
127.0.0.1   localhost localhost.localdomain localhost4 localhost4.localdomain4
::1         localhost localhost.localdomain localhost6 localhost6.localdomain6
192.168.122.160  ts1
192.168.122.160  ts2
192.168.122.160  ts3
192.168.122.160  ts4
192.168.122.160  ts5
```

5.5 Make possible ssh-passwordless connections to test servers

```
# cd /root
# ssh-keygen -t rsa -b 4096 -C "test"
# cd .ssh
# ssh-copy-id -f -i id_rsa.pub root@ts1
...
# ssh-copy-id -f -i id_rsa.pub root@ts5
```


### 6. Deploy the cockpit plugin

1. Get the cockpit plugin project
```
# sudo su -
# cd /usr/share
# sudo git clone https://github.com/pcuzner/cockpit-ceph-installer.git
# cd cockpit-ceph-installer
# git checkout tls-support
# git pull
# exit
```

2. add a symlink to the dist folder of your ceph-installer directory
```
# sudo cd /usr/share/cockpit-ceph-installer/dist
# sudo ln -snf $PWD /usr/share/cockpit/ceph-installer
# sudo systemctl restart cockpit.socket
```
4. point your browser at port 9091 of the machine, and login as root
   - make sure runner-service has been started - if not, the UI will tell you!


-----------------------------------------------------------------------------------------------------------------

## Hack on it

To hack on the UI plugin, you'll need a nodejs install for ReactJS and a cockpit environment. Take a look at the
[dev guide](DEVGUIDE.md) for instructions covering how to set things up.

For background, take a look at the great starter kit [docs](https://github.com/cockpit-project/starter-kit) that the cockpit devs have produced.
