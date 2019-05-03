import React from 'react';
import '../app.scss';

export class ProgressTracker extends React.Component {
    //
    // Provides the Progress tracker widget at the top of the page
    constructor(props) {
        super(props);
        this.state = {};
        this.itemState = Array(7).fill("indicator");
    }

    render() {
        if (this.props.pageNum >= 1) {
            for (let i = 1; i < 7; i++) {
                if (i == this.props.pageNum) {
                    this.itemState[i] = "indicator selected";
                } else {
                    this.itemState[i] = "indicator";
                }
            }
        }

        return (
            <div id="navcontainer">
                <span label-name="Environment" className={this.itemState[1]}>1</span>
                <span className="joiner">&nbsp;</span>
                <span label-name="Hosts" className={this.itemState[2]}>2</span>
                <span className="joiner">&nbsp;</span>
                <span label-name="Validate" className={this.itemState[3]}>3</span>
                <span className="joiner">&nbsp;</span>
                <span label-name="Network" className={this.itemState[4]}>4</span>
                <span className="joiner">&nbsp;</span>
                <span label-name="Review" className={this.itemState[5]}>5</span>
                <span className="joiner">&nbsp;</span>
                <span label-name="Deploy" className={this.itemState[6]}>6</span>
            </div>
        );
    }
}

export default ProgressTracker;
