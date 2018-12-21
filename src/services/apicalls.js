import cockpit from 'cockpit';

const apiPort = 5001;
const apiHost = 'localhost';
const http = cockpit.http({
    "address": apiHost,
    "port": apiPort,
    "tls": {
        "validate": false // localhost isn't tls validated anyway
    }
});

export function addGroup(groupName, svcToken) {
    console.log("requesting new group " + groupName);
    let promise = http.post('/api/v1/groups/' + groupName, null, { Authorization: svcToken });
    return promise;
}

export function deleteGroup(groupName, svcToken) {
    console.log("attemting to remove " + groupName + "from the inventory");
    let url = "/api/v1/groups/" + groupName;
    return http.request({
        path: url,
        body: {},
        method: "delete",
        headers: {Authorization: svcToken}
    });
}

export function getGroups(svcToken) {
    console.log("fetching defined groups");
    let promise = http.get('/api/v1/groups', null, { Authorization: svcToken });
    return promise;
}

export function addHost(hostName, groupNames, svcToken) {
    console.log("Adding host to the ansible inventory");

    let groups = groupNames.replace(',', '*').split('*');
    let groupString = groups[0];
    if (groups.length > 1) {
        groupString += '?others=' + groups[1];
    }

    let url = 'api/v1/hosts/' + hostName + '/groups/' + groupString;
    let promise = http.post(url, null, { Authorization: svcToken });

    return promise;
}

export function deleteHost(hostName, svcToken) {
    console.log("removing " + hostName + " from the inventory");
    let url = "/api/v1/hosts/" + hostName;
    return http.request({
        path: url,
        body: {},
        method: "delete",
        headers: {Authorization: svcToken}
    });
}

export function changeHost(hostname, role, checked, svctoken) {
    console.log("changeHost: changing host state for " + hostname + " role=" + role);
    if (!checked) {
        if (role == 'mons') {
            console.log("requesting mgr to be removed");
            return removeRole(hostname, 'mgrs', svctoken).then(_ => {
                return removeRole(hostname, role, svctoken);
            });
        } else {
            return removeRole(hostname, role, svctoken);
        }
    } else {
        if (role == 'mons') {
            console.log("requesting mons role");
            return addRole(hostname, 'mgrs', svctoken).then(_ => {
                return addRole(hostname, role, svctoken);
            });
        } else {
            return addRole(hostname, role, svctoken);
        }
    }
}

export function addRole(hostName, roleName, svcToken) {
    console.log("Adding role " + roleName + " to " + hostName);
    let url = "/api/v1/hosts/" + hostName + "/groups/" + roleName;
    return http.post(url, null, { Authorization: svcToken });
}

export function removeRole(hostName, roleName, svcToken) {
    console.log("Removing role " + roleName + " from " + hostName);
    let url = "/api/v1/hosts/" + hostName + "/groups/" + roleName;
    return http.request({
        path: url,
        body: {},
        method: "delete",
        headers: {Authorization: svcToken}
    });
}

export function runPlaybook(playbookName, data, svcToken) {
    console.log("starting playbook " + playbookName);
    let url = "/api/v1/playbooks/" + playbookName;
    return http.post(url, data, { Authorization: svcToken });
}

export function getPlaybookState(playUUID, svcToken) {
    console.log("checking playbook with UUID " + playUUID);
    let url = "/api/v1/playbooks/" + playUUID;
    return http.get(url, null, { Authorization: svcToken });
}

export function getTaskEvents(playUUID, taskName, svcToken) {
    console.log("looking for job events");
    let url = "/api/v1/jobs/" + playUUID + "/events?task=" + taskName;
    return http.get(url, null, { Authorization: svcToken });
}

export function getEvents(playUUID, svcToken) {
    console.log("fetching events from play with UUID " + playUUID);
    let url = "/api/v1/jobs/" + playUUID + "/events";
    return http.get(url, null, {Authorization: svcToken});
}

export function getJobEvent(playUUID, eventUUID, svcToken) {
    console.log("fetching event ID " + eventUUID);
    let url = "/api/v1/jobs/" + playUUID + "/events/" + eventUUID;
    return http.get(url, null, {Authorization: svcToken});
}

export function storeGroupVars(groupName, vars, svcToken) {
    console.log("Storing group vars for group " + groupName);
    let url = "/api/v1/groupvars/" + groupName;
    return http.post(url, vars, { Authorization: svcToken });
}

export function storeHostVars(hostName, groupName, vars, svcToken) {
    console.log("storing host vars for host " + hostName);
    let url = "/api/v1/hostvars/" + hostName + "/groups/" + groupName;
    return http.post(url, vars, { Authorization: svcToken });
}

export function checkAPI(svcToken) {
    console.log("checking API is there");
    return http.get("api", null, {Authorization: svcToken});
}
