import React from 'react';
import '../../app.scss';

export class OnOffSwitch extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            disabled: false,
            checked: this.props.checked
        };
    }

    handleToggle = (event) => {
        console.log("switch clicked - ");
        let newCheckedState = !this.state.checked;
        // console.debug(JSON.stringify(event.target));
        this.setState({
            checked: newCheckedState
        });

        // pass state back to parent via callback
        this.props.callback(this.props.name, newCheckedState);
    }

    render() {
        let switchState, switchMargin;
        console.log("onoffswitch render for onoffswitch with name " + this.props.name + " status=" + this.state.checked);
        if (this.state.checked) {
            switchState = "bootstrap-switch-on switch-label";
            switchMargin = "0px";
        } else {
            switchState = "bootstrap-switch-off switch-label";
            switchMargin = "-33px";
        }

        return (
            <div className={"bootstrap-switch bootstrap-switch-wrapper bootstrap-switch-animate " + switchState} style={{width: "68px"}}>
                <div className="bootstrap-switch-container switch-label" style={{width: "99px", marginLeft: [switchMargin]}}>
                    <span className="bootstrap-switch-handle-on bootstrap-switch-primary switch-label" style={{width: "33px"}} onClick={this.handleToggle}>ON</span>
                    <span className="bootstrap-switch-label switch-label" style={{minWidth: "33px"}} onClick={this.handleToggle}>&nbsp;</span>
                    <span className="bootstrap-switch-handle-off bootstrap-switch-default switch-label" style={{width: "33px"}} onClick={this.handleToggle}>OFF</span>
                </div>
            </div >
        );
    }
}
