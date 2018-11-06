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

        return (
            <button className="bottomRight btn btn-primary btn-lg" disabled={btnState} onClick={this.props.action}>Next</button>
        );
    }
}
