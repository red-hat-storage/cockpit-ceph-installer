# cockpit-ceph-installer Developer Guide

## Introduction
The cockpit-ceph-installer plugin provides a UI to install Ceph - which is cool, but this UI is only the 'tip of the iceberg'. All the heavy lifting for the installation itself is done by the [ceph-ansible](https://github.com/ceph/ceph-ansible) project, and of course ansible itself so kudos to those developers for providing the framework for the UI to depend on! 

## Software Stack
The cockpit-ceph-installer application is a plugin for the cockpit subsystem available on most platforms. Plugins are written using the following technology stack:
- Reactjs 
- Cockpit
- Javascript
- CSS

The [starter-kit](https://github.com/cockpit-project/starter-kit) is a good resource to get more familiar with the cockpit development environment, and the documentation for cockpit can be found [here](https://cockpit-project.org/guide/latest/)

## cockpit-ceph-installer Component Overview
The installer is based on 6 discrete steps, so the logic and UI is also split into discrete components - each one corresponding to a step in the install sequence.

| App | Parent | Child | Description |
| --- | --- | --- | --- |
| app.jsx | | | React app definition. Loads configuration information, and renders the installationSteps page |
| | installationsteps.jsx |  | Defines state that is used/updated by the child components. Renders the child components that correspond to each of the phases in the install. Each child can pass back state updates to the parent, which will propogate to the other children keeping things in sync. |
| | | welcomepage.jsx | Simple welcome page, describing the overall workflow |
| | | environmentpage.jsx | Offer selections that govern the target cluster environment, passing back these options to the parent |
| | | hostspage.jsx | UI to gather host information and make calls to the runner-service to add hosts/roles to the ansible configuration. The resulting hosts and roles are passed back to the parent |
| | | validatepage.jsx | Validates the hosts using the `check-role.yml` playbook to probe the hosts config and compare against the requested roles. The playbook passes back it’s assessment which is rendered in the UI. |
| | | networkpage.jsx | Use the results from the probe to show the available networks and speeds detected on the hosts. |
| | | reviewpage.jsx | Shows all the selections made, prior to moving to deployment |
| | | deploypage.jsx | First step is a **save** operation to commit the options selected to the ansible files. Once committed the site-*.yml file can be run to start the deployment process. Errors are trapped and shown in the UI in summary form, with a modal overlay to show all error details from failed tasks. |
  
So armed with this information you should be able to easily pinpoint which file you need to work on when implementing a new feature within the installer!

## Design Considerations    
In addition to the main components, common widgets and components are defined in the src/common directory and a single css file contains all the attributes for every page in the app (*this could probably do with some scrutiny to remove duplicate definitions etc*)
  
React’s design is based on a *“state engine”*. Changes in parent state, propagate through to child components, redriving UI rendering keeping the data model in-sync. The ceph-installer holds it’s main (parent) state in the installationsteps.jsx file, which means that when state is passed back to the parent all the child component pages will be re-rendered - it’s just that you don’t see this due to the css class associated with the component being set to “behind”.
  
When making code changes, you have to consider this state propagation and how data flows to components. For example, you can’t pass state to component siblings - all state changes must get passed up to the parent, which will drive the render method to push the changes down to all children.
  
The app makes extensive use of cockpit’s **http** and **file** methods to communicate with the physical host. These calls use javascript [promises](https://developers.google.com/web/fundamentals/primers/promises) and all happen async. The async nature of the call needs to be accounted for in the code … just because you called the API on line 10, doesn’t mean the API response is available to the next instruction!
  
Another gotcha to be aware of is the async nature of component state itself. State should only be updated with the setState function, but even when a setState has been run, the actual update to the variables is scheduled by react. Bottom line - you can't use setState on line10, and expect to see the new value on line 11!

## How stuff Works  
### Breadcrumbs on the Deploy page
The playbook that ceph-ansible runs processes the roles in a specific sequence, so to implement a breadcrumb trail following the installation process the
code in ansibleMap/cephAnsibleSequence arranges the chosen roles from the host definition in a sequence compatible with the install flow. Once we have this sequence we can check the role in a tasks output to indicate whereabouts we are in the installation process, giving us the breadcrumb effect.  

The actual flow from ceph-ansible (June 2019) is as follows;  
mons > mgrs > osds > mdss > rgws > nfs > rbdmirrors > clients > iscsigws > grafana-server (metrics)  

The main code responsible for tracking is the setRoleState function in the DeployPage component.  

### Host metadata
Host hardware configuration is extracted from a playbook run that uses the ceph_check_role.py ansible library module. This module calls the same methods to build the configuration metadata that ansible calls itself from the "setup" module. The metadata returned passes through a Checker class to determine whether the host is 'worthy' given the set of roles associated with it. Within the app, a host is represented as a json object that looks like this;  
```
insert code here
```

Here's an example of the hosts array, that holds host objects.
```
{
	"mon": true,
	"mds": false,
	"osd": true,
	"rgw": false,
	"iscsi": false,
	"metrics": false,
	"hostmaskOK": true,
	"msgLevel": "info",
	"msgText": "",
	"status": "OK",
	"hostname": "nautilus-3",
	"cpu": 4,
	"ram": 4,
	"nic": 1,
	"hdd": 4,
	"ssd": 0,
	"capacity": "4T / 0",
	"ready": "OK",
	"info": "Connectivity verified, added to the inventory",
	"msgs": ["warning:#CPU's too low (min 6 needed)", "warning:Network bandwith low for the number of potential OSDs", "warning:RAM too low (min 20G needed)"],
	"vendor": "QEMU",
	"model": "pc-i440fx-2.10",
	"selected": true,
	"cpuType": ["AMD FX(tm)-8320 Eight-Core Processor"],
	"subnets": ["10.90.90.0/24", "172.17.0.0/16"],
	"subnet_details": {
		"10.90.90.0/24": {
			"count": 1,
			"speed": 0,
			"addr": "10.90.90.129",
			"devices": ["ansible_eth0"],
			"desc": "10.90.90.0/24"
		},
		"172.17.0.0/16": {
			"count": 0,
			"speed": 0,
			"addr": "172.17.0.1",
			"devices": [],
			"desc": "172.17.0.0/16"
		}
	},
	"hdd_devices": ["vdb", "vdc", "vdd", "vde"],
	"ssd_devices": []
}
```


## External Files  
The app makes use of 3 files that are read from the hosts local filesystem during the initial load of the app.jsx code.  

`/etc/ansible-runner-service/certs/client/client.crt`  
`/etc/ansible-runner-service/certs/client/client.key`  
These are the client certificate files that provide TLS mutual auth to the ansible runner service. If these files are missing, app.jsx flags an
 error and prevents the rest of the application components from loading.
   
`/var/lib/cockpit/ceph-installer/defaults.json`  
The environment page uses a set of defaults for installation source, osd type etc. These defaults can be overridden by supplying a defaults.json file that declares these variables. App.jsx attempts to read the defaults.json file, and if it’s found and valid it will override your settings with the application defaults (defined in app.jsx)
  
An example of an override file would be 
```
{
  "clusterType": "Development/POC",
  "installType": "RPM",
  "osdType": "Filestore"
}
```


## Development environment
### Hacking on the plugin
1. Ensure **tcp/9090** is available and accessible on your machine
2. Install and enable cockpit
```
yum install -y cockpit cockpit-bridge
systemctl enable --now cockpit.service
```
2. Install nodejs
```
yum install -y gcc-c++ make  
curl -sL https://rpm.nodesource.com/setup_10.x | sudo -E bash -  
yum install -y nodejs
```

3. Download the project archive. The project repo provides a package.json (for webpack) and babel config, so to build the plugin files just run  
```
# make 
```

4. Link your dist directory to one that cockpit will use. By default cockpit will look in the ```~/.local/share/cockpit``` directory for 
user specific plugins - so this is where we want to place a symlink.
```
cd ~
mkdir -p .local/share/cockpit
ln -s <dist directory> ceph-installer
```
*above tested on CentOS7*

### Rebuilding the app
The app is built by webpack, and the repo provides a `Makefile` courtesy of the cockpit plugin starter kit. These pieces make rebuilding the application very simple...just run `make`!.  
  
Once make completes, you’ll have the application artifacts compiled into the ‘dist’ folder. As long as your cockpit environment can see this folder, you’re good to go.  

## Debuging from the browsers console log
### Startup
When the app loads into cockpit, it first verifies the environment is set up correctly. In the client's browser log you should see the following events
- client crt file accessible (should be in /etc/ansible-runner-service/certs/client/)
- client key file accessible (should be in /etc/ansible-runner-service/certs/client/)
- API responded and ready (this is a call to the /api endpoint on port 5001 of the cockpit host)

If you see the above messages, all is right with the world. The installationsteps page will load fully and populate the child pages.  

Missing client files indicate that the generate_certs.sh script hasn't been run, or the locations/names of the files has been changed by the user.
API access issues could relate to the runner-service container not running, or access to the port is blocked by the firewall.

The startup also attempts to apply and overrides to the defaults set in the code. If there is a valid defaults.json (it must be JSON) you should see the
 the following
```
 Overrides are : {"clusterType":"Development/POC","sourceType":"Community","targetVersion":"14 (Nautilus)"}
 Defaults are : {"iscsiTargetName":"iqn.2003-01.com.redhat.iscsi-gw:ceph-igw","sourceType":"Community","targetVersion":"14 (Nautilus)","clusterType":"Development/POC","installType":"Container","networkType":"ipv4","osdType":"Bluestore","osdMode":"None","flashUsage":"Journals/Logs"}
```  
So if you see unexpected settings in the Environment page, check that the defaults override file is set up correctly. 



### Playbook execution
The console log will show the play UUID of the executing playbook which will correspond to a `/usr/share/ansible-runner-service/artifacts/<playUUID>`
This directory will hold a subdir called job_events which correspond to all the tasks. Other files of interest are rc, status and stdout.  
- rc ... will show the return code of the run
- stdout .. contains all the content that would have been seen at the terminal from a run at the CLI
- status .. text description - showing wither successful, failed or canceled.

When playbooks run, the UI polls the events API endpoint every 2 seconds. This interval is hardcoded.
