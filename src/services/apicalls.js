import cockpit from 'cockpit';

const apiPort = 5001;
const apiHost = 'localhost';
const http = cockpit.http({
    "address": apiHost,
    "port": apiPort,
    "tls": {
        "certificate": {
            "file": "/etc/ansible-runner-service/certs/client/client.crt",
        },
        "key": {
            "file": "/etc/ansible-runner-service/certs/client/client.key",
        },
        "validate": false // localhost isn't tls validated anyway
    }
});

export function now() {
    // return time, compatible with the ansible-runner-service log file
    let t = new Date();
    return t.toString().split(" ")[4] + "," + t.getMilliseconds();
}

export function addGroup(groupName) {
    console.log("requesting new group " + groupName + " @ " + now());
    let promise = http.post('/api/v1/groups/' + groupName); //, null, { Authorization: svcToken });
    return promise;
}

export function deleteGroup(groupName) {
    console.log("attempting to remove " + groupName + " @ " + now());
    let url = "/api/v1/groups/" + groupName;
    return http.request({
        path: url,
        body: {},
        method: "DELETE"
    });
}

export function getGroups() {
    console.log("fetching defined groups @ " + now());
    let promise = http.get('/api/v1/groups'); //, null, { Authorization: svcToken });
    return promise;
}

export function addHost(hostName, groupNames) {
    console.log("Adding host to the ansible inventory @ " + now());

    let groups = groupNames.replace(',', '*').split('*');
    let groupString = groups[0];
    if (groups.length > 1) {
        groupString += '?others=' + groups[1];
    }

    let url = '/api/v1/hosts/' + hostName + '/groups/' + groupString;
    let promise = http.post(url); //, null, { Authorization: svcToken });

    return promise;
}

export function deleteHost(hostName) {
    console.log("removing " + hostName + " from the inventory @ " + now());
    let url = "/api/v1/hosts/" + hostName;
    return http.request({
        path: url,
        body: {},
        method: "DELETE"
    });
}

export function getHosts() {
    console.log("fetching defined host list @ " + now());
    let promise = http.get('/api/v1/hosts');
    return promise;
}

export function getHostGroup(hostName) {
    console.log("fetching defined host groups @ " + now());
    let promise = http.get('/api/v1/hosts/' + hostName);
    return promise;
}

export function changeHost(hostname, role, checked) {
    console.log("changeHost: changing host state for " + hostname + " role=" + role + " @ " + now());
    if (!checked) {
        if (role == 'mons') {
            console.log("requesting mgr to be removed");
            return removeRole(hostname, 'mgrs').then(_ => {
                return removeRole(hostname, role);
            });
        } else {
            return removeRole(hostname, role);
        }
    } else {
        if (role == 'mons') {
            console.log("requesting mons role");
            return addRole(hostname, 'mgrs').then(_ => {
                return addRole(hostname, role);
            });
        } else {
            return addRole(hostname, role);
        }
    }
}

export function addRole(hostName, roleName) {
    console.log("Adding role " + roleName + " to " + hostName + " @ " + now());
    let url = "/api/v1/hosts/" + hostName + "/groups/" + roleName;
    return http.post(url); //, null, { Authorization: svcToken });
}

export function removeRole(hostName, roleName) {
    console.log("Removing role " + roleName + " from " + hostName + " @ " + now());
    let url = "/api/v1/hosts/" + hostName + "/groups/" + roleName;
    return http.request({
        path: url,
        body: {},
        method: "DELETE"
    });
}

export function runPlaybook(playbookName, data) {
    console.log("starting playbook " + playbookName + " @ " + now());
    let url = "/api/v1/playbooks/" + playbookName;
    return http.post(url, data); //, { Authorization: svcToken });
}

export function getPlaybookState(playUUID) {
    console.log("checking playbook with UUID " + playUUID + " @ " + now());
    let url = "/api/v1/playbooks/" + playUUID;
    return http.get(url); //, null, { Authorization: svcToken });
}

export function getTaskEvents(playUUID, taskName) {
    console.log("looking for job events");
    let url = "/api/v1/jobs/" + playUUID + "/events?task=" + taskName;
    return http.get(url); //, null, { Authorization: svcToken });
}

export function getEvents(playUUID) {
    console.log("fetching events from play with UUID " + playUUID);
    let url = "/api/v1/jobs/" + playUUID + "/events";
    return http.get(url); //, null, {Authorization: svcToken});
}

export function getJobEvent(playUUID, eventUUID) {
    console.log("fetching event ID " + eventUUID);
    let url = "/api/v1/jobs/" + playUUID + "/events/" + eventUUID;
    return http.get(url); //, null, {Authorization: svcToken});
}

export function storeGroupVars(groupName, vars) {
    console.log("Storing group vars for group " + groupName + " @ " + now());
    let url = "/api/v1/groupvars/" + groupName;
    return http.post(url, vars); //, { Authorization: svcToken });
}

export function storeHostVars(hostName, groupName, vars) {
    console.log("storing host vars for host " + hostName + " @ " + now());
    let url = "/api/v1/hostvars/" + hostName + "/groups/" + groupName;
    return http.post(url, vars); //, { Authorization: svcToken });
}

export function checkAPI() {
    console.log("checking API is there @ " + now());
    return http.get("/api"); // , null, {Authorization: svcToken});
}
