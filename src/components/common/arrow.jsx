import React from 'react';
import '../../app.scss';

export class Arrow extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            class: "display-inline-block arrow-right toggle-reset"
        };
    }

    clickHandler = () => {
        console.log("in clcik handler");
        // handle the arrow being clicked on
        if (this.state.class.includes('toggle-down')) {
            console.log("changing to reset");
            this.setState({class: "display-inline-block arrow-right toggle-reset"});
        } else {
            console.log("changing to down");
            this.setState({class: "display-inline-block arrow-right toggle-down"});
        }

        if (this.props.clickHandler) {
            this.props.clickHandler();
        }
    }

    render () {
        console.log("in arrow render method");
        return (
            <div className={this.state.class} onClick={this.clickHandler} />
        );
    }
}
