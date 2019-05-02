import React from 'react';
import '../../app.scss';

export class ElapsedTime extends React.Component {
    //
    // Simple elapsed timer widget
    constructor(props) {
        super(props);
        this.state = {
            timer: 0,
            active: false
        };
        this.loadInterval = 0;
    }

    updateTimer = () => {
        let currentTime = this.state.timer;
        this.setState({timer: currentTime + 1});
    }

    componentWillReceiveProps (props) {
        if (props.active && !this.state.active) {
            this.startTimer();
        }
        if (!props.active && this.state.active) {
            this.stopTimer();
        }
    }

    startTimer = () => {
        this.setState({
            timer: 0,
            active: true
        });
        this.loadInterval = setInterval(this.updateTimer, 1000);
    }

    stopTimer = () => {
        this.setState({active: false});
        clearInterval(this.loadInterval);
    }

    componentWillUnmount(props) {
        console.log("Unmounting the ElapsedTime component, cancelling the timer");
        clearInterval(this.loadInterval);
        this.props.callback(this.state.timer);
    }

    render() {
        let date = new Date(null);
        date.setSeconds(this.state.timer);
        let timeStr = date.toISOString().substr(11, 8);

        return (
            <span>{timeStr}</span>
        );
    }
}
