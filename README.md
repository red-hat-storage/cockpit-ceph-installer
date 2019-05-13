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

### 2. Setup the ansible-runner-service container  
2.1 Pull the image from docker hub (~670MB)
```
# docker pull jolmomar/ansible_runner_service
```

### 3. Enable the cockpit interface
If your testing with Ceph Nautilus, the installer requires a host for Metrics (prometheus and grafana). The port used by Prometheus conflicts with the port used by cockpit, so if you want to run the metrics services on the 'ansible host, you need to;  
  3.1 Set up an overridge file for cockpit
```
mkdir /etc/systemd/system/cockpit.socket.d
echo -e "[Socket]\nListenStream=\nListenstream=9091" > /etc/systemd/system/cockpit.socket.d/listen.conf
systemctl daemon-reload
```
  3.2 If SELINUX is enabled, you may also need to allow the new port to be used
```
# sudo semanage port -a -t websm_port_t -p tcp 9091
```
  3.3 Start the cockpit service
```
systemctl enable --now cockpit.socket  
```
*for further information, the offical docs are [here](https://cockpit-project.org/guide/latest/listen.html)*  

### 4. Grab ceph-ansible from the Ceph project
4.1 Pull ceph-ansible from github and switch to the wip-dashboard branch (just until this merges!)
```
cd /usr/share
git clone https://github.com/ceph/ceph-ansible.git
cd ceph-ansible
git checkout wip-dashboard
git pull
```
4.2 From the /usr/share/ceph-ansible directory, add the check_check_role module to ceph-ansible
```
wget -P ./library https://raw.githubusercontent.com/pcuzner/ceph-check-role/master/library/ceph_check_role.py
wget -P ./ https://raw.githubusercontent.com/pcuzner/ceph-check-role/master/checkrole.yml
```

### 5. Setup the ansible-runner-service  
Although the ansible-runner-service runs as a container, it's configuration and playbooks come from the host filesystem.  
5.1 create configuration directories
```
mkdir /etc/ansible-runner-service
mkdir -p /usr/share/ansible-runner-service/{env,inventory,artifacts}
mkdir -p /etc/ansible-runner-service/certs/{client,server}
chcon -Rt container_file_t /usr/share/ansible-runner-service
```
5.2 Seed the /etc/ansible-runner-service directory  
```
insert stuff here
```
5.3 Create the self-signed cert, server and client certificates
```
insert stuff here
```
5.x Start the service
```
docker run --rm -d --network=host -p 5001:5001/tcp -v /usr/share/ansible-runner-service:/usr/share/ansible-runner-service -v /usr/share/ceph-ansible:/usr/share/ansible-runner-service/project -v /etc/ansible-runner-service:/etc/ansible-runner-service --name runner-service jolmomar/ansible_runner_service
``` 

### 6. Deploy the cockpit plugin

1. create cockpit directory in root's home folder
```
cd ~
mkdir -p .local/share/cockpit
```
2. grab the dist folder from the project
3. add a symlink to the dist folder in your ceph-installer directory
```
cd /root/.local/share/cockpit
ln -s ~/ceph-installer/dist/ ceph-installer
```
4. point your browser at port 9091 of the machine, and login as root
   - make sure runner-service has been started - if not, the UI will tell you!


-----------------------------------------------------------------------------------------------------------------

## Hack on it

To hack on the UI plugin, you'll need a nodejs install for ReactJS and a cockpit environment. Take a look at the 
[dev guide](DEVGUIDE.md) for instructions covering how to set things up.

For background, take a look at the great starter kit [docs](https://github.com/cockpit-project/starter-kit) that the cockpit devs have produced.
