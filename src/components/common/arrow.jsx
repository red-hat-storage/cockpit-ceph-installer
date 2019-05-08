import React from 'react';
import '../../app.scss';

export class Arrow extends React.Component {
    //
    // used in the validate page table as an indicator to expand a row
    constructor (props) {
        super(props);
        this.state = {
            class: "display-inline-block arrow-right toggle-reset"
        };
    }

    clickHandler = () => {
        // handle the arrow being clicked on
        if (this.state.class.includes('toggle-down')) {
            this.setState({class: "display-inline-block arrow-right toggle-reset"});
        } else {
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
