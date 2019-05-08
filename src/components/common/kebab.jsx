import React from 'react';
import '../../app.scss';

export class Kebab extends React.Component {
    //
    // Kebab based on the Patternfly spec @ https://www.patternfly.org/pattern-library/widgets/#kebabs
    constructor (props) {
        super(props);
        this.state = {
            menu: "dropdown-menu hidden dropdown-menu-tbl-right"
        };
    }

    toggle = () => {
        if (this.state.menu === "dropdown-menu hidden dropdown-menu-tbl-right") {
            this.setState({
                menu: "dropdown-menu visible dropdown-menu-tbl-right"
            });
        } else {
            this.setState({
                menu: "dropdown-menu hidden dropdown-menu-tbl-right"
            });
        }
    }

    clickHandler = (value, callback) => {
        this.setState({
            menu: "dropdown-menu hidden dropdown-menu-tbl-right"
        });
        callback(value);
    }

    render () {
        let actions;

        // must use mousedown on the li components to prevent the button onclick sequence clash
        if (this.props.actions) {
            actions = this.props.actions.map((item, idx) => {
                return <li key={idx}><a onMouseDown={ e => { this.clickHandler(this.props.value, item.callback) }} >{ item.action }</a></li>;
            });
        } else {
            actions = (<div />);
        }
        console.log("rendering kebab");
        return (
            <div className="dropdown  dropdown-kebab-pf" >
                <button className="btn btn-link dropdown-toggle"
                        type="button"
                        onBlur={() => { this.setState({menu:"dropdown-menu hidden dropdown-menu-tbl-right"}) }}
                        onClick={this.toggle} >
                    <span className="fa fa-ellipsis-v" />
                </button>
                <ul className={this.state.menu} >
                    { actions }
                </ul>
            </div>
        );
    }
}
