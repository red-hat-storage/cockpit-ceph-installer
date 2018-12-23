import React from 'react';
import '../../app.scss';

// export function NextButton (props) {
export class NextButton extends React.Component {
    render() {
        var btnState;
        if (this.props.disabled == undefined) {
            btnState = false;
        } else {
            btnState = this.props.disabled;
        }
        var btnText;
        if (this.props.btnText != undefined) {
            btnText = this.props.btnText;
        } else {
            btnText = 'Next >';
        }

        return (
            <button className="bottomRight btn btn-primary btn-lg" disabled={btnState} onClick={this.props.action}>{btnText}</button>
        );
    }
}

export class UIButton extends React.Component {
    render () {
        let btnClass;
        if (this.props.btnClass) {
            btnClass = this.props.btnClass;
        } else {
            btnClass = (this.props.primary) ? "nav-button btn btn-lg btn-primary" : "nav-button btn btn-lg";
        }

        return (
            <button className={btnClass} disabled={this.props.disabled} onClick={this.props.action}>{this.props.btnLabel}</button>
        );
    }
}
