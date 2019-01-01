import React from 'react';
import '../../app.scss';

export class Notification extends React.Component {
    constructor(props) {
        super(props);
        this.state = {};
    }
    // msgLevel = error, warning, info
    // msgText = text string / jsx component

    forceUpdateHandler = () => {
        this.forceUpdate();
    }

    render() {
        console.log("rendering inline notification - " + this.props.msgText);
        let msgClass;
        let msgIcon;
        let notification;
        switch (this.props.msgLevel) {
        case "error":
            msgClass = "alert alert-danger";
            msgIcon = "pficon pficon-error-circle-o";
            break;
        case "warning":
            msgClass = "alert alert-warning";
            msgIcon = "pficon pficon-warning-triangle-o";
            break;
        case "success":
            msgClass = "alert alert-success";
            msgIcon = "pficon pficon-ok";
            break;
        default:
            msgClass = "alert alert-info";
            msgIcon = "pficon pficon-info";
            break;
        }
        // message = (this.props.msgText) ? this.props.msgText : 'dummy message';
        if (this.props.msgText) {
            notification = (
                <div className={msgClass} >
                    <span className={msgIcon} />
                    { this.props.msgText }
                </div>
            );
        } else {
            notification = (
                <div className="alert-space" />
            );
        }
        return (
            <div>{ notification }</div>
        );
    }
}
