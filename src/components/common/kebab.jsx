import React from 'react';
import '../../app.scss';

export class Kebab extends React.Component {
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
        // e.preventDefault();
        // event.preventDefault();
        this.setState({
            menu: "dropdown-menu hidden dropdown-menu-tbl-right"
        });
        callback(value);
    }

    render () {
        // event.preventDefault();
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
// onBlur={() => { this.setState({menu:"dropdown-menu hidden"}) }}

// {/* <div class="dropdown  dropdown-kebab-pf">
// <button class="btn btn-link dropdown-toggle" type="button" id="dropdownKebab" data-toggle="dropdown" aria-haspopup="true" aria-expanded="true">
//   <span class="fa fa-ellipsis-v"></span>
// </button>
// <ul class="dropdown-menu " aria-labelledby="dropdownKebab">
//   <li><a href="#">Action</a></li>
//   <li><a href="#">Another action</a></li>
//   <li><a href="#">Something else here</a></li>
//   <li role="separator" class="divider"></li>
//   <li><a href="#">Separated link</a></li>
// </ul>
// </div> */}
