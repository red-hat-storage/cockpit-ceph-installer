import React from 'react';
import '../../app.scss';

export class RoleCheckbox extends React.Component {
    //
    // checkbox based on Patternfly https://www.patternfly.org/pattern-library/forms-and-controls/data-input/#checkboxes
    constructor (props) {
        super(props);

        if (this.props.disabled) {
            this.state = {
                disabled: true
            };
        } else {
            this.state = {
                disabled: false
            };
        }
    }

    checkboxUpdate = (event) => {
        console.log("passing checked state(" + event.target.checked + ") up to parent");
        if (this.props.callback) {
            this.props.callback(this.props.role, event.target.checked);
        }
    }

    render() {
        console.log(this.props.role + " checkbox defined as " + this.props.checked);
        return (
            <div style={{width: "20px", display: "inline-block"}}>
                <label className="cbox">
                    <input type="checkbox"
                        ref={this.props.role}
                        checked={this.props.checked}
                        disabled={this.state.disabled}
                        onChange={this.checkboxUpdate} />
                    <span className="checkmark" />
                </label>
            </div>
        );
    }
}
