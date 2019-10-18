import React from 'react';
import '../../app.scss';

export class PasswordBox extends React.Component {
    /* PasswordBox is implemented as a separate component, so we can add show/reveal
      functionality later
    */
    constructor (props) {
        super(props);
        this.state = {
            class: "display-inline-block arrow-right toggle-reset"
        };
    }

    updateParent = (event) => {
        console.debug("left the password box");
        this.props.callback(event);
    }

    render () {
        return (
            <div>
                <span className="input-label-horizontal display-inline-block"><b>{this.props.passwordPrompt}</b></span>
                <input type="password"
                       name={this.props.name}
                       defaultValue={this.props.value}
                       maxLength="20"
                       className="form-control input-lg input-text display-inline-block"
                       placeholder="Password"
                       onBlur={this.updateParent} />
            </div>
        );
    }
}
