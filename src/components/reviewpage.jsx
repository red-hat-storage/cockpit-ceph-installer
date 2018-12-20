import React from 'react';
import { NextButton } from './common/nextbutton.jsx';
import '../app.scss';

export class ReviewPage extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            className: this.props.className
        };
    }

    render() {
        return (

            <div id="review" className={this.props.className}>
                <h3>5. Review</h3>
                Review your settings before deployment<br />
                <NextButton action={this.props.action} />
            </div>
        );
    }
}

export default ReviewPage;
