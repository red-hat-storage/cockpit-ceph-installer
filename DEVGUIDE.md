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


## External Files  
The app makes use of 2 files that are read from the hosts local filesystem during the initial load of the app.jsx code.  
`/etc/ansible-runner-service/svctoken`  
This is the jwt created for local access to the ansible runner service API endpoint. The token is created by the ansible runner service, and can only be used for 127.0.0.1 api calls - but by using the token the cockpit code doesn’t have to worry about login credentials and token expiration.
  
***NB.** this will change in the next couple of weeks as the ansible-runner-server replaces JWT with mutual TLS auth (courtesy of nginx)*
  
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


## Creating your test environment
** insert content here! **

### Rebuilding the app
The app is built by webpack, and the repo provides a Makefile courtesy of the cockpit plugin starter kit. These pieces make rebuilding the application very simple...just run make.  
  
Once make completes, you’ll have the application artifacts compiled into the ‘dist’ folder. As long as your cockpit environment can see this folder, you’re good to go. For example, when you login to cockpit as root, if you place a symlink from `~/.local/share/cockpit/ceph-installer` to your `dist` directory you’ll see your changes by simply refreshing your browser to reload the app.  
